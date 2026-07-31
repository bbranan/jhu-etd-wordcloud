# Tasks

## Task 1: Create the stop words module

Create `scripts/stop-words.js` containing an exported array of 100+ common English stop words used to filter out non-meaningful terms from word frequency analysis.

### Sub-tasks

- [x] Create the file `scripts/stop-words.js`
- [x] Export an array named `stopWords` containing at minimum 100 common English stop words (e.g., "the", "and", "is", "of", "to", "in", "for", "with", "that", "this", etc.)
- [x] Include articles, prepositions, conjunctions, pronouns, common verbs (be/have/do forms), and modal verbs
- [x] Use `module.exports` for CommonJS compatibility with Node.js

### Requirements Addressed

- Requirement 3, AC 3

---

## Task 2: Create the harvester script with API integration and text processing

Create `scripts/harvest.js` that fetches all ETD abstracts from the JScholarship DSpace 9.1 REST API discovery search endpoint, processes them into word frequencies, and writes the output files.

### Sub-tasks

- [x] Create `scripts/harvest.js` using Node.js built-in `fetch` (Node 20+)
- [x] Read the `API_DELAY` environment variable, validate it as an integer between 100–10000, default to 1000ms if missing or invalid, and log a warning on invalid input
- [x] Implement a `fetchWithRetry` function that retries on 5xx/network errors up to 3 times with exponential backoff (1s, 2s, 4s) and skips on 4xx errors with a log message
- [x] Paginate through `GET /server/api/discover/search/objects?scope=034cfaee-2d8c-4640-80df-2bff73abd9c0&dsoType=item&page={n}&size=20` starting at page 0 until all pages are retrieved
- [x] Apply the configured delay between each API request
- [x] Extract `dc.description.abstract` metadata from each item's `_embedded.indexableObject.metadata` object; skip items missing this field
- [x] Write collected abstracts to `data/abstracts.json` as a JSON array of strings
- [x] Tokenize all abstracts by splitting on whitespace, strip leading/trailing punctuation (`/^[^\w]+|[^\w]+$/g`), and convert to lowercase
- [x] Filter out tokens shorter than 3 characters, tokens that are entirely numeric (`/^\d+$/`), and tokens in the stop words list
- [x] Count occurrences of each remaining token and sort by count descending
- [x] Write word frequency data to `data/word_frequencies.json` as a JSON object mapping words to integer counts
- [x] If no countable words remain after filtering, write an empty JSON object `{}`
- [x] Log total items processed and items skipped due to missing abstracts
- [x] Exit with non-zero status code if the API remains unavailable after all retries

### Dependencies

- Task 1

### Requirements Addressed

- Requirement 1, ACs 1–5
- Requirement 3, ACs 1–7
- Requirement 7, ACs 1–4
- Requirement 8, ACs 1–4

---

## Task 3: Create the static website HTML and CSS

Create `site/index.html` and `site/css/style.css` for the word cloud static site with full-viewport layout.

### Sub-tasks

- [x] Create `site/index.html` with proper HTML5 structure, charset, viewport meta tag, and a title referencing JHU ETD Word Cloud
- [x] Link to `css/style.css` and `js/word-cloud.js`
- [x] Include a container `<div id="word-cloud">` for the word cloud rendering
- [x] Include a hidden `<div id="error-message">` for displaying error states
- [x] Create `site/css/style.css` with styles that make the word cloud container fill the full viewport width and height
- [x] Style word links with `cursor: pointer` on hover, no default underline, and varied colors
- [x] Ensure the page has no default margins or padding on `html`/`body`
- [x] Add basic accessibility: appropriate color contrast and `aria-label` on the word cloud container

### Requirements Addressed

- Requirement 4, AC 1
- Requirement 5, AC 3

---

## Task 4: Create the word cloud JavaScript

Create `site/js/word-cloud.js` that fetches word frequency data and renders an interactive word cloud.

### Sub-tasks

- [x] Fetch `../data/word_frequencies.json` relative to the site root using `fetch()`
- [x] On fetch failure or invalid JSON, display an error message in `#error-message` indicating data is unavailable
- [x] Determine the maximum frequency from the data
- [x] Compute font size for each word: `10 + (70 * (count / maxCount))` px, yielding a range of 10–80px
- [x] Display at least 100 words if 100+ are available; display all words if fewer than 100
- [x] Render each word as an `<a>` element with `target="_blank"` and `rel="noopener"`
- [x] Set each link's `href` to `https://jscholarship.library.jhu.edu/search?query={encodeURIComponent(word)}&scope=034cfaee-2d8c-4640-80df-2bff73abd9c0`
- [x] Position words within the viewport using a spiral placement algorithm with collision detection to avoid overlap
- [x] URL-encode the word in the search URL to handle special characters safely

### Dependencies

- Task 3

### Requirements Addressed

- Requirement 4, ACs 2–6
- Requirement 5, ACs 1–4

---

## Task 5: Create the GitHub Actions workflow

Create `.github/workflows/harvest-and-deploy.yml` that schedules the harvester, commits data changes, and deploys to GitHub Pages.

### Sub-tasks

- [x] Create the workflow file with `schedule` trigger (`0 0 * * 0` — weekly on Sundays at midnight UTC) and `workflow_dispatch` trigger
- [x] Add `workflow_dispatch` input `api_delay` with description, type integer, default 1000
- [x] Define a `harvest` job: checkout repo, setup Node.js 20, run `node scripts/harvest.js` with `API_DELAY` env var set from the input parameter
- [x] In the `harvest` job, on script success, check if `data/word_frequencies.json` has changed using `git diff`; if changed, commit and push both data files
- [x] If the harvest script exits non-zero, skip the commit step and let the workflow report failure
- [x] Define a `deploy` job that depends on `harvest` succeeding: checkout repo, use `actions/upload-pages-artifact` to package the `site/` and `data/` directories, then deploy with `actions/deploy-pages`
- [x] Add appropriate `permissions` for `contents: write` (harvest job) and `pages: write`, `id-token: write` (deploy job)
- [x] If harvest fails, the deploy job is skipped, preserving the previously deployed site

### Dependencies

- Task 2
- Task 4

### Requirements Addressed

- Requirement 2, ACs 1–4
- Requirement 6, ACs 1–5
- Requirement 8, AC 1

---

## Task 6: Create data directory with placeholder files

Create `data/abstracts.json` and `data/word_frequencies.json` with empty initial content so the repository structure is in place and the site can load without errors before the first harvest.

### Sub-tasks

- [x] Create `data/abstracts.json` containing an empty JSON array `[]`
- [x] Create `data/word_frequencies.json` containing an empty JSON object `{}`

### Requirements Addressed

- Requirement 3, AC 7
- Requirement 4, AC 6
