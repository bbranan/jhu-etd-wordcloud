# Design Document

## Overview

This design describes a two-component system: a Node.js harvester script that collects ETD abstract data from the JScholarship DSpace 9.1 REST API and produces word frequency data, and a static HTML/CSS/JavaScript website that renders an interactive word cloud from that data. A GitHub Actions workflow orchestrates scheduling, data commits, and GitHub Pages deployment.

## Architecture

The system follows a static-site generation pattern where data is pre-computed by a scheduled pipeline and consumed at runtime by a client-side application.

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Actions Workflow                     │
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐ │
│  │   Harvest     │────▶│  Word Freq   │────▶│  Commit &   │ │
│  │   Abstracts   │     │  Processing  │     │  Deploy     │ │
│  └──────┬───────┘     └──────────────┘     └─────────────┘ │
│         │                                                    │
└─────────┼────────────────────────────────────────────────────┘
          │ DSpace REST API
          ▼
┌──────────────────┐         ┌─────────────────────────────────┐
│  JScholarship    │         │   GitHub Pages (Static Site)     │
│  DSpace 9.1      │         │                                  │
│  REST API        │         │  index.html + word-cloud.js      │
│                  │         │  loads word_frequencies.json      │
└──────────────────┘         └─────────────────────────────────┘
```

## Components

### Component 1: Harvester Script (`scripts/harvest.js`)

**Technology:** Node.js (no external dependencies beyond the Node.js standard library)

**Responsibility:** Retrieve all ETD abstracts from JScholarship, process them into word frequency data, and write the output as JSON files.

#### DSpace 9.1 REST API Integration

JScholarship runs DSpace 9.1, which uses the same REST API contract as DSpace 7+. The REST API is available at:

- Base URL: `https://jscholarship.library.jhu.edu/server/api`
- ETD Community UUID: `034cfaee-2d8c-4640-80df-2bff73abd9c0`

**Discovery Search Endpoint** (used to retrieve all items scoped to the ETD community):

```
GET /api/discover/search/objects?scope=034cfaee-2d8c-4640-80df-2bff73abd9c0&dsoType=item&page={n}&size={pageSize}
```

Parameters:
- `scope`: UUID of the ETD community to limit results
- `dsoType`: Set to `item` to only retrieve DSpace items
- `page`: Zero-based page index
- `size`: Number of results per page (max governed by server config, use 20)
- `sort`: Optional, default ordering is fine

**Response Structure** (HAL format):
```json
{
  "_embedded": {
    "searchResult": {
      "_embedded": {
        "objects": [
          {
            "_embedded": {
              "indexableObject": {
                "uuid": "...",
                "metadata": {
                  "dc.description.abstract": [
                    { "value": "Abstract text here...", "language": "en" }
                  ]
                }
              }
            }
          }
        ]
      },
      "page": {
        "number": 0,
        "size": 20,
        "totalElements": 5000,
        "totalPages": 250
      }
    }
  }
}
```

**Pagination:** The harvester follows the `page` object in the response, incrementing `page` from 0 until `page.number >= page.totalPages - 1`. Each item's `dc.description.abstract` metadata field is extracted. Items missing this field are skipped and counted.

**Rate Limiting:** A configurable delay (default 1000ms) is applied between each API request using `setTimeout`/`await`.

**Retry Logic:** On 5xx or network errors, retry up to 3 times with exponential backoff (1s, 2s, 4s). On 4xx errors, log and skip without retrying.

#### Text Processing Pipeline

1. Concatenate all collected abstract strings
2. Tokenize by splitting on whitespace (`/\s+/`)
3. Strip leading/trailing punctuation from each token (`/^[^\w]+|[^\w]+$/g`)
4. Convert to lowercase
5. Filter out:
   - Tokens shorter than 3 characters
   - Tokens that are entirely numeric digits (`/^\d+$/`)
   - Stop words (embedded list of 100+ common English words)
6. Count occurrences of each remaining token
7. Sort by count descending
8. Write to `data/word_frequencies.json`

#### Output Files

- `data/abstracts.json` — JSON array of raw abstract strings
- `data/word_frequencies.json` — JSON object mapping words to integer counts, sorted descending by count

### Component 2: Static Website (`site/`)

**Technology:** Vanilla HTML, CSS, and JavaScript (no build step, no framework)

**Files:**
- `site/index.html` — Page structure and metadata
- `site/css/style.css` — Full-viewport layout, pointer cursor, responsive text
- `site/js/word-cloud.js` — Fetches data, computes layout, renders word cloud

#### Word Cloud Rendering

The word cloud uses absolute positioning with randomized placement and collision avoidance:

1. Fetch `word_frequencies.json` via `fetch()`
2. Determine the maximum frequency value
3. For each word, compute font size: `10 + (70 * (count / maxCount))` px (range 10–80px)
4. Display at least 100 words (or all if fewer than 100 available)
5. Render each word as an `<a>` element positioned within the viewport using a spiral/random placement algorithm
6. On fetch failure or invalid JSON, display an error message

#### Word Links

Each word links to JScholarship's discovery search scoped to the ETD community:

```
https://jscholarship.library.jhu.edu/search?query={encodeURIComponent(word)}&scope=034cfaee-2d8c-4640-80df-2bff73abd9c0
```

Links open in a new tab (`target="_blank"` with `rel="noopener"`).

### Component 3: GitHub Actions Workflow (`.github/workflows/harvest-and-deploy.yml`)

**Triggers:**
- `schedule`: Weekly cron (`0 0 * * 0` — Sundays at midnight UTC)
- `workflow_dispatch`: Manual trigger with input parameter:
  - `api_delay`: Integer (100–10000), delay in ms between API requests, default 1000

**Jobs:**

1. **harvest** job:
   - Checkout repository
   - Setup Node.js 20
   - Run `node scripts/harvest.js` with `API_DELAY` environment variable
   - On success, check if `data/word_frequencies.json` differs from committed version
   - If changed, commit and push updated data files
   - On failure (non-zero exit), skip commit and fail the workflow

2. **deploy** job (depends on harvest succeeding):
   - Checkout repository (with the new commit if data changed)
   - Deploy `site/` directory plus `data/` directory to GitHub Pages using `actions/deploy-pages`

## Data Flow

```
JScholarship API  ──GET /api/discover/search/objects──▶  harvest.js
                                                            │
                                                            ▼
                                                    data/abstracts.json
                                                    data/word_frequencies.json
                                                            │
                                                            ▼
                                                    Git commit & push
                                                            │
                                                            ▼
                                                    GitHub Pages deploy
                                                            │
                                                            ▼
                                          site/index.html fetches word_frequencies.json
                                                            │
                                                            ▼
                                                   Interactive word cloud
```

## File Structure

```
jhu-etd-wordcloud/
├── .github/
│   └── workflows/
│       └── harvest-and-deploy.yml
├── scripts/
│   ├── harvest.js
│   └── stop-words.js
├── data/
│   ├── abstracts.json
│   └── word_frequencies.json
├── site/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── word-cloud.js
├── LICENSE
└── README.md
```

## API Endpoints Reference

| Purpose | Method | URL |
|---------|--------|-----|
| Search items in ETD community | GET | `https://jscholarship.library.jhu.edu/server/api/discover/search/objects?scope=034cfaee-2d8c-4640-80df-2bff73abd9c0&dsoType=item&page={n}&size=20` |
| Get single item metadata | GET | `https://jscholarship.library.jhu.edu/server/api/core/items/{uuid}` |
| Frontend search (word click) | — | `https://jscholarship.library.jhu.edu/search?query={word}&scope=034cfaee-2d8c-4640-80df-2bff73abd9c0` |

## Key Design Decisions

1. **Discovery search over community collections listing**: Using `/api/discover/search/objects` with `scope` parameter retrieves all items across all sub-collections within the ETD community in a single paginated flow. This avoids needing to enumerate collections first and then query items per collection.

2. **No authentication required**: The DSpace REST API provides anonymous read access to public items and metadata. No login or token is needed for harvesting.

3. **No external runtime dependencies for the harvester**: Using only Node.js built-in `https` module (or `fetch` in Node 20+) keeps the GitHub Actions job simple with no `npm install` step.

4. **No frontend framework**: The word cloud site is pure HTML/CSS/JS to minimize complexity, maximize performance, and align with the GitHub Pages static hosting model.

5. **Data stored in repository**: The `data/` directory is committed to the repo so the static site can reference it directly when deployed, with no need for a separate API or database.
