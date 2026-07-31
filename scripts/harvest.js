#!/usr/bin/env node

/**
 * ETD Word Cloud Harvester
 *
 * Fetches all ETD abstracts from the JScholarship DSpace 9.1 REST API,
 * processes them into word frequencies, and writes the output files.
 *
 * Usage: node scripts/harvest.js
 * Environment: API_DELAY (ms between requests, 100-10000, default 1000)
 */

const fs = require('fs');
const path = require('path');
const { stopWords } = require('./stop-words.js');

// --- Configuration ---

const BASE_URL = 'https://jscholarship.library.jhu.edu/server/api';
const ETD_COMMUNITY_UUID = '034cfaee-2d8c-4640-80df-2bff73abd9c0';
const SEARCH_ENDPOINT = `${BASE_URL}/discover/search/objects`;
const PAGE_SIZE = 20;
const MAX_RETRIES = 3;
const DEFAULT_DELAY = 1000;

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

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

/**
 * Fetch with retry logic.
 * Retries on 5xx/network errors up to 3 times with exponential backoff (1s, 2s, 4s).
 * Skips on 4xx errors with a log message.
 * Returns null if request should be skipped (4xx) or fails after all retries.
 * Throws if API is unavailable after all retries (for fatal exit).
 */
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS });

      if (response.ok) {
        return await response.json();
      }

      if (response.status >= 400 && response.status < 500) {
        console.error(`Client error ${response.status} for ${url}. Skipping.`);
        return null;
      }

      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
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
      // Network error
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

// --- Text Processing ---

const stopWordsSet = new Set(stopWords);

function tokenizeAndCount(abstracts) {
  const wordCounts = {};

  for (const abstract of abstracts) {
    // Split on whitespace
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
  console.log(`Starting ETD abstract harvest (API delay: ${apiDelay}ms)...`);

  const abstracts = [];
  let totalItems = 0;
  let skippedItems = 0;
  let currentPage = 0;
  let totalPages = 1; // Will be updated after first request

  try {
    while (currentPage < totalPages) {
      const url = `${SEARCH_ENDPOINT}?scope=${ETD_COMMUNITY_UUID}&dsoType=item&page=${currentPage}&size=${PAGE_SIZE}`;

      const data = await fetchWithRetry(url);
      if (data === null) {
        // 4xx error on pagination request — fatal, cannot continue
        throw new Error('Received client error on pagination request. Cannot continue.');
      }

      // Extract pagination info
      const searchResult = data._embedded && data._embedded.searchResult;
      if (!searchResult) {
        throw new Error('Unexpected API response structure: missing _embedded.searchResult');
      }

      const pageInfo = searchResult.page;
      if (pageInfo) {
        totalPages = pageInfo.totalPages;
        console.log(`Page ${currentPage + 1}/${totalPages} (total items: ${pageInfo.totalElements})`);
      }

      // Extract items from this page
      const objects = searchResult._embedded && searchResult._embedded.objects;
      if (objects && Array.isArray(objects)) {
        for (const obj of objects) {
          totalItems++;
          const indexableObject = obj._embedded && obj._embedded.indexableObject;
          if (!indexableObject || !indexableObject.metadata) {
            skippedItems++;
            continue;
          }

          const abstractField = indexableObject.metadata['dc.description.abstract'];
          if (!abstractField || !Array.isArray(abstractField) || abstractField.length === 0) {
            skippedItems++;
            continue;
          }

          const abstractValue = abstractField[0].value;
          if (abstractValue) {
            abstracts.push(abstractValue);
          } else {
            skippedItems++;
          }
        }
      }

      currentPage++;

      // Apply delay between requests (not after the last one)
      if (currentPage < totalPages) {
        await sleep(apiDelay);
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
