#!/usr/bin/env node

/**
 * ETD Word Cloud Harvester
 *
 * Fetches all ETD abstracts from the JScholarship DSpace 9.1 OAI-PMH endpoint,
 * processes them into word frequencies, and writes the output files.
 *
 * Uses OAI-PMH ListRecords with oai_dc metadata format to retrieve abstracts
 * from the ETD community set.
 *
 * Usage: node scripts/harvest.js
 * Environment: API_DELAY (ms between requests, 100-10000, default 1000)
 */

const fs = require('fs');
const path = require('path');
const { stopWords } = require('./stop-words.js');

// --- Configuration ---

const OAI_BASE_URL = 'https://jscholarship.library.jhu.edu/server/oai/request';
const ETD_COMMUNITY_SET = 'com_034cfaee-2d8c-4640-80df-2bff73abd9c0';
const METADATA_PREFIX = 'oai_dc';
const MAX_RETRIES = 3;
const DEFAULT_DELAY = 1000;

const REQUEST_HEADERS = {
  'User-Agent': 'jhu-etd-wordcloud/1.0 (https://github.com/bbranan/jhu-etd-wordcloud)',
  'Accept': 'text/xml, application/xml'
};

// --- API Delay Configuration ---

function getApiDelay() {
  const raw = process.env.API_DELAY;
  if (raw === undefined || raw === '') {
    return DEFAULT_DELAY;
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed < 100 || parsed > 10000) {
    console.warn(`WARNING: Invalid API_DELAY value "${raw}". Must be an integer between 100 and 10000. Using default ${DEFAULT_DELAY}ms.`);
    return DEFAULT_DELAY;
  }
  return parsed;
}

// --- Utility Functions ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch URL with retry logic.
 * Retries on 5xx/network errors up to 3 times with exponential backoff (1s, 2s, 4s).
 * Skips on 4xx errors with a log message.
 * Returns response text or null on 4xx. Throws on exhausted retries.
 */
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS });

      if (response.ok) {
        return await response.text();
      }

      if (response.status >= 400 && response.status < 500) {
        console.error(`Client error ${response.status} for ${url}. Skipping.`);
        return null;
      }

      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(`Server error ${response.status} for ${url}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`Server error ${response.status} after ${MAX_RETRIES} retries for ${url}`);
      }
    } catch (error) {
      if (error.message && error.message.includes('after') && error.message.includes('retries')) {
        throw error;
      }
      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`Network error for ${url}: ${error.message}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(backoff);
        continue;
      }
      throw new Error(`Network error after ${MAX_RETRIES} retries for ${url}: ${error.message}`);
    }
  }
  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES} retries`);
}

// --- Simple XML Parsing (no external dependencies) ---

/**
 * Extract all text content between matching XML tags.
 * Returns an array of strings found between <tagName>...</tagName>.
 * Handles namespaced tags by matching the local name.
 */
function extractTagValues(xml, tagName) {
  const values = [];
  // Match both namespaced and non-namespaced variants
  // e.g., <dc:description> or <description>
  const regex = new RegExp(`<(?:[a-z]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?${tagName}>`, 'gi');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    // Decode basic XML entities
    const value = match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
    if (value) {
      values.push(value);
    }
  }
  return values;
}

/**
 * Extract the resumptionToken from an OAI-PMH response.
 * Returns the token string or null if no more pages.
 */
function extractResumptionToken(xml) {
  const match = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return null;
}

/**
 * Check if the OAI-PMH response contains an error element.
 * Returns the error code and message, or null if no error.
 */
function extractOaiError(xml) {
  const match = xml.match(/<error\s+code="([^"]+)"[^>]*>([^<]*)<\/error>/);
  if (match) {
    return { code: match[1], message: match[2] };
  }
  return null;
}

/**
 * Extract individual records from OAI-PMH ListRecords response.
 * Returns array of XML strings, each being a single <record>...</record>.
 */
function extractRecords(xml) {
  const records = [];
  const regex = /<record>([\s\S]*?)<\/record>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    records.push(match[1]);
  }
  return records;
}

// --- Text Processing ---

const stopWordsSet = new Set(stopWords);

function tokenizeAndCount(abstracts) {
  const wordCounts = {};

  for (const abstract of abstracts) {
    const tokens = abstract.split(/\s+/);

    for (let token of tokens) {
      // Strip leading/trailing punctuation
      token = token.replace(/^[^\w]+|[^\w]+$/g, '');
      // Convert to lowercase
      token = token.toLowerCase();

      // Filter: skip short tokens, numeric-only tokens, and stop words
      if (token.length < 3) continue;
      if (/^\d+$/.test(token)) continue;
      if (stopWordsSet.has(token)) continue;

      wordCounts[token] = (wordCounts[token] || 0) + 1;
    }
  }

  return wordCounts;
}

function sortByCountDescending(wordCounts) {
  const entries = Object.entries(wordCounts);
  entries.sort((a, b) => b[1] - a[1]);
  const sorted = {};
  for (const [word, count] of entries) {
    sorted[word] = count;
  }
  return sorted;
}

// --- Main Harvest Function ---

async function main() {
  const apiDelay = getApiDelay();
  console.log(`Starting ETD abstract harvest via OAI-PMH (API delay: ${apiDelay}ms)...`);
  console.log(`OAI endpoint: ${OAI_BASE_URL}`);
  console.log(`Set: ${ETD_COMMUNITY_SET}`);

  const abstracts = [];
  let totalItems = 0;
  let skippedItems = 0;
  let requestCount = 0;

  try {
    // First request: ListRecords with set and metadataPrefix
    let url = `${OAI_BASE_URL}?verb=ListRecords&metadataPrefix=${METADATA_PREFIX}&set=${ETD_COMMUNITY_SET}`;
    let hasMore = true;

    while (hasMore) {
      requestCount++;
      console.log(`Request ${requestCount}: ${url.substring(0, 120)}...`);

      const xml = await fetchWithRetry(url);
      if (xml === null) {
        throw new Error('Received client error on OAI-PMH request. Cannot continue.');
      }

      // Check for OAI-PMH errors
      const oaiError = extractOaiError(xml);
      if (oaiError) {
        if (oaiError.code === 'noRecordsMatch') {
          console.log('No records found matching the query. This may mean the set identifier is incorrect.');
          break;
        }
        throw new Error(`OAI-PMH error [${oaiError.code}]: ${oaiError.message}`);
      }

      // Extract records from this page
      const records = extractRecords(xml);
      for (const record of records) {
        // Skip deleted records
        if (record.includes('status="deleted"')) {
          continue;
        }

        totalItems++;

        // Extract dc:description values (abstracts are in <dc:description>)
        const descriptions = extractTagValues(record, 'description');
        if (descriptions.length > 0) {
          // Use the first description as the abstract
          // Filter out very short descriptions that are likely not abstracts
          const abstract = descriptions.find(d => d.length > 50) || descriptions[0];
          if (abstract && abstract.length > 20) {
            abstracts.push(abstract);
          } else {
            skippedItems++;
          }
        } else {
          skippedItems++;
        }
      }

      // Check for resumptionToken (pagination)
      const token = extractResumptionToken(xml);
      if (token) {
        url = `${OAI_BASE_URL}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
        // Apply delay between requests
        await sleep(apiDelay);
      } else {
        hasMore = false;
      }
    }
  } catch (error) {
    console.error(`Fatal error during harvest: ${error.message}`);
    process.exit(1);
  }

  console.log(`Harvest complete. Total items processed: ${totalItems}. Items skipped (no abstract): ${skippedItems}.`);
  console.log(`Abstracts collected: ${abstracts.length}`);

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Write abstracts.json
  const abstractsPath = path.join(dataDir, 'abstracts.json');
  fs.writeFileSync(abstractsPath, JSON.stringify(abstracts, null, 2), 'utf-8');
  console.log(`Wrote ${abstracts.length} abstracts to ${abstractsPath}`);

  // Process word frequencies
  const wordCounts = tokenizeAndCount(abstracts);
  const sorted = sortByCountDescending(wordCounts);

  // Write word_frequencies.json (empty object if no words)
  const freqPath = path.join(dataDir, 'word_frequencies.json');
  if (Object.keys(sorted).length === 0) {
    fs.writeFileSync(freqPath, '{}', 'utf-8');
    console.log('No countable words found. Wrote empty object to word_frequencies.json');
  } else {
    fs.writeFileSync(freqPath, JSON.stringify(sorted, null, 2), 'utf-8');
    console.log(`Wrote ${Object.keys(sorted).length} unique words to ${freqPath}`);
  }
}

main();
