# Requirements Document

## Introduction

The ETD Word Cloud is a web application for Johns Hopkins University that visualizes the most prominent terms found in Electronic Theses and Dissertations (ETDs) hosted in the JScholarship DSpace repository. The system consists of two parts: a data collection pipeline that harvests ETD abstracts via a scheduled GitHub Actions workflow, and a static website deployed on GitHub Pages that renders an interactive word cloud from the collected data.

## Glossary

- **Harvester**: The automated script responsible for collecting ETD abstract data from the JScholarship DSpace REST API
- **ETD_Collection**: The Electronic Theses and Dissertations community in JScholarship, accessible at https://jscholarship.library.jhu.edu/communities/034cfaee-2d8c-4640-80df-2bff73abd9c0
- **Word_Cloud_Site**: The static website deployed on GitHub Pages that displays the interactive word cloud
- **Abstract**: The text summary of an ETD item as stored in the DSpace metadata
- **Word_Frequency_Data**: The processed output of the Harvester containing words and their occurrence counts across all ETD abstracts
- **DSpace_REST_API**: The REST API provided by the JScholarship DSpace 7+ instance for programmatic access to repository content
- **GitHub_Actions_Workflow**: The CI/CD pipeline configuration that schedules and runs the Harvester
- **Stop_Words**: Common English words (e.g., "the", "and", "is") that are excluded from word frequency analysis

## Requirements

### Requirement 1: Harvest ETD Abstracts

**User Story:** As a site maintainer, I want to automatically collect abstracts from all ETDs in JScholarship, so that the word cloud reflects the full body of thesis and dissertation content.

#### Acceptance Criteria

1. WHEN the GitHub_Actions_Workflow is triggered, THE Harvester SHALL retrieve abstracts from all items across all collections within the ETD_Collection community using the DSpace_REST_API
2. WHEN the Harvester retrieves items, THE Harvester SHALL extract the `dc.description.abstract` metadata field from each ETD item
3. IF an ETD item does not contain an abstract metadata field, THEN THE Harvester SHALL skip that item and continue processing remaining items
4. WHEN the Harvester completes retrieval, THE Harvester SHALL store the collected abstracts as a JSON array of strings in a file within the GitHub repository
5. WHEN the Harvester completes retrieval, THE Harvester SHALL log the total number of items processed and the number of items skipped due to missing abstracts

### Requirement 2: Schedule Data Collection

**User Story:** As a site maintainer, I want the data collection to run on a regular schedule, so that the word cloud stays current as new ETDs are added.

#### Acceptance Criteria

1. THE GitHub_Actions_Workflow SHALL execute the Harvester on a weekly schedule
2. THE GitHub_Actions_Workflow SHALL support manual triggering via workflow_dispatch
3. WHEN the Harvester completes successfully and the data file content differs from the version currently in the repository, THE GitHub_Actions_Workflow SHALL commit the updated data file to the repository
4. IF the Harvester exits with a non-zero status code, THEN THE GitHub_Actions_Workflow SHALL skip the commit step and report the workflow run as failed

### Requirement 3: Process Word Frequencies

**User Story:** As a site maintainer, I want the raw abstracts processed into word frequency counts, so that the word cloud can display terms sized by prevalence.

#### Acceptance Criteria

1. WHEN abstracts are collected, THE Harvester SHALL tokenize the abstract text into individual words by splitting on whitespace and stripping leading and trailing punctuation characters from each resulting token
2. THE Harvester SHALL normalize words to lowercase before counting
3. THE Harvester SHALL exclude Stop_Words from the word frequency count using a standard English stop word list containing at minimum 100 common words (e.g., "the", "and", "is", "of", "to", "in")
4. THE Harvester SHALL produce Word_Frequency_Data as a JSON file mapping each word to its integer occurrence count across all abstracts, sorted by count in descending order
5. THE Harvester SHALL exclude words shorter than 3 characters from the Word_Frequency_Data
6. THE Harvester SHALL exclude tokens that consist entirely of numeric digits from the Word_Frequency_Data
7. IF no abstracts contain any countable words after filtering, THEN THE Harvester SHALL produce a Word_Frequency_Data file containing an empty JSON object

### Requirement 4: Display Word Cloud

**User Story:** As a visitor, I want to see a large visual word cloud of ETD terms, so that I can quickly understand the research themes at Johns Hopkins.

#### Acceptance Criteria

1. THE Word_Cloud_Site SHALL render a word cloud visualization using the full width and height of the browser viewport
2. THE Word_Cloud_Site SHALL size each word with a font size between 10px and 80px, scaled relative to that word's frequency compared to the highest frequency word in the Word_Frequency_Data
3. WHEN the page loads, THE Word_Cloud_Site SHALL fetch the Word_Frequency_Data from a static JSON file and render the word cloud
4. IF the Word_Frequency_Data contains 100 or more words, THEN THE Word_Cloud_Site SHALL display at least 100 words in the word cloud
5. IF the Word_Frequency_Data contains fewer than 100 words, THEN THE Word_Cloud_Site SHALL display all available words
6. IF the Word_Frequency_Data file fails to load or contains invalid JSON, THEN THE Word_Cloud_Site SHALL display an error message indicating that the word cloud data is unavailable

### Requirement 5: Interactive Word Links

**User Story:** As a visitor, I want to click any word in the word cloud to search for it in JScholarship, so that I can explore related theses and dissertations.

#### Acceptance Criteria

1. WHEN a visitor clicks a word in the word cloud, THE Word_Cloud_Site SHALL open a new browser tab with a JScholarship search for that word scoped to the ETD_Collection, without replacing the current page
2. THE Word_Cloud_Site SHALL construct the search URL using the JScholarship discovery search interface with the selected word as the query parameter and the ETD_Collection community UUID (034cfaee-2d8c-4640-80df-2bff73abd9c0) as the scope parameter
3. WHILE a visitor hovers over a word, THE Word_Cloud_Site SHALL change the cursor to a pointer to indicate the word is clickable
4. WHEN constructing the search URL, THE Word_Cloud_Site SHALL URL-encode the selected word to ensure special characters are safely included in the query parameter

### Requirement 6: Static Site Deployment

**User Story:** As a site maintainer, I want the word cloud site deployed automatically on GitHub Pages, so that it is publicly accessible without additional hosting.

#### Acceptance Criteria

1. WHEN the data collection step completes successfully, THE GitHub_Actions_Workflow SHALL deploy the Word_Cloud_Site to GitHub Pages
2. THE Word_Cloud_Site SHALL consist of static HTML, CSS, and JavaScript files that require no server-side processing
3. THE GitHub_Actions_Workflow SHALL include the Word_Frequency_Data JSON file in the deployed site artifacts
4. WHEN the deployment completes, THE Word_Cloud_Site SHALL be accessible at the repository's GitHub Pages URL
5. IF the data collection step fails, THEN THE GitHub_Actions_Workflow SHALL skip the deployment step and preserve the previously deployed Word_Cloud_Site

### Requirement 7: Error Handling During Harvest

**User Story:** As a site maintainer, I want the harvester to handle API errors gracefully, so that transient failures do not break the data pipeline.

#### Acceptance Criteria

1. IF the DSpace_REST_API returns a server error (5xx) or a network failure (timeout, connection refused), THEN THE Harvester SHALL retry the request up to 3 times with exponential backoff starting at 1 second and doubling each attempt
2. IF the DSpace_REST_API remains unavailable after all retries are exhausted, THEN THE Harvester SHALL log the error and exit with a non-zero status code
3. WHEN the DSpace_REST_API returns paginated results, THE Harvester SHALL follow pagination to retrieve all items in the ETD_Collection
4. IF the DSpace_REST_API returns a non-retryable client error (4xx), THEN THE Harvester SHALL log the error and skip the failed request without retrying

### Requirement 8: Configurable API Call Rate

**User Story:** As a site maintainer, I want to control the rate at which the harvester calls the DSpace REST API, so that data collection completes in a reasonable timeframe without placing excessive load on the JScholarship application.

#### Acceptance Criteria

1. THE GitHub_Actions_Workflow SHALL expose a configurable workflow_dispatch input parameter for the delay between API requests, specified in milliseconds, accepting integer values between 100 and 10000
2. THE Harvester SHALL pause for the configured delay duration between each request to the DSpace_REST_API
3. WHEN no custom delay value is provided, THE Harvester SHALL use a default delay of 1000 milliseconds between requests
4. IF the provided delay value is outside the range of 100 to 10000 milliseconds or is not a valid integer, THEN THE Harvester SHALL fall back to the default delay of 1000 milliseconds and log a warning indicating the invalid input
