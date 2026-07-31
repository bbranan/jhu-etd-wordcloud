(function () {
  'use strict';

  const SEARCH_BASE = 'https://jscholarship.library.jhu.edu/search';
  const SCOPE = '034cfaee-2d8c-4640-80df-2bff73abd9c0';
  const MIN_FONT_SIZE = 10;
  const MAX_FONT_SIZE = 80;
  const MIN_WORDS = 100;

  const container = document.getElementById('word-cloud');
  const errorEl = document.getElementById('error-message');

  /**
   * Show the error message element.
   */
  function showError() {
    errorEl.removeAttribute('hidden');
  }

  /**
   * Check if two rectangles overlap.
   */
  function rectsOverlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  /**
   * Check if a rectangle overlaps with any placed rectangles.
   */
  function hasCollision(rect, placed) {
    for (let i = 0; i < placed.length; i++) {
      if (rectsOverlap(rect, placed[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find a position for a word using spiral placement from center.
   * Returns {x, y} or null if no position found.
   */
  function findPosition(wordWidth, wordHeight, containerWidth, containerHeight, placed) {
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const angleStep = 0.3;
    const radiusStep = 2;
    const maxAttempts = 800;

    for (let i = 0; i < maxAttempts; i++) {
      const angle = i * angleStep;
      const radius = i * radiusStep;
      const x = centerX + radius * Math.cos(angle) - wordWidth / 2;
      const y = centerY + radius * Math.sin(angle) - wordHeight / 2;

      // Check bounds
      if (x < 0 || y < 0 || x + wordWidth > containerWidth || y + wordHeight > containerHeight) {
        continue;
      }

      const rect = {
        left: x,
        top: y,
        right: x + wordWidth,
        bottom: y + wordHeight
      };

      if (!hasCollision(rect, placed)) {
        return { x: x, y: y, rect: rect };
      }
    }

    return null;
  }

  /**
   * Measure text dimensions using an offscreen element.
   */
  function measureWord(word, fontSize) {
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'nowrap';
    span.style.fontSize = fontSize + 'px';
    span.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    span.textContent = word;
    document.body.appendChild(span);
    const width = span.offsetWidth;
    const height = span.offsetHeight;
    document.body.removeChild(span);
    return { width: width, height: height };
  }

  /**
   * Render the word cloud from frequency data.
   */
  function renderWordCloud(data) {
    const words = Object.keys(data);

    // Empty data — just show nothing (not an error)
    if (words.length === 0) {
      return;
    }

    // Determine max frequency
    let maxCount = 0;
    for (let i = 0; i < words.length; i++) {
      if (data[words[i]] > maxCount) {
        maxCount = data[words[i]];
      }
    }

    if (maxCount === 0) {
      return;
    }

    // Sort words by frequency descending
    words.sort(function (a, b) {
      return data[b] - data[a];
    });

    // Select how many words to display
    var wordCount = words.length;
    if (wordCount > MIN_WORDS) {
      wordCount = Math.max(MIN_WORDS, Math.min(wordCount, 200));
    }
    var displayWords = words.slice(0, wordCount);

    // Get container dimensions
    var containerWidth = container.offsetWidth || window.innerWidth;
    var containerHeight = container.offsetHeight || window.innerHeight;

    var placed = [];

    for (var i = 0; i < displayWords.length; i++) {
      var word = displayWords[i];
      var count = data[word];
      var fontSize = MIN_FONT_SIZE + (MAX_FONT_SIZE - MIN_FONT_SIZE) * (count / maxCount);

      // Measure word dimensions
      var dims = measureWord(word, fontSize);

      // Find position using spiral placement
      var position = findPosition(dims.width, dims.height, containerWidth, containerHeight, placed);

      if (!position) {
        // If we can't place it, skip this word
        continue;
      }

      // Create the anchor element
      var link = document.createElement('a');
      link.textContent = word;
      link.href = SEARCH_BASE + '?query=' + encodeURIComponent(word) + '&scope=' + SCOPE;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.fontSize = fontSize + 'px';
      link.style.left = position.x + 'px';
      link.style.top = position.y + 'px';

      container.appendChild(link);
      placed.push(position.rect);
    }
  }

  // Fetch data and render
  fetch('../data/word_frequencies.json')
    .then(function (response) {
      if (!response.ok) {
        throw new Error('HTTP error: ' + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('Invalid data format');
      }
      renderWordCloud(data);
    })
    .catch(function () {
      showError();
    });
})();
