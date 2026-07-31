/**
 * Common English stop words for filtering non-meaningful terms
 * from word frequency analysis.
 *
 * Includes articles, prepositions, conjunctions, pronouns,
 * common verbs (be/have/do forms), and modal verbs.
 */
const stopWords = [
  // Articles (3)
  "the", "a", "an",

  // Prepositions (34)
  "of", "in", "to", "for", "with", "on", "at", "from", "by", "about",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "along", "until", "upon", "across", "against",
  "among", "around", "behind", "beside", "beyond", "within", "without",
  "toward", "over",

  // Conjunctions (17)
  "and", "but", "or", "nor", "yet", "so", "both", "either",
  "neither", "whether", "while", "although", "because", "since", "unless",
  "than", "when",

  // Pronouns (30)
  "this", "that", "these", "those", "which", "who", "whom",
  "what", "each", "every", "all", "any", "few", "more", "most",
  "other", "some", "such", "its", "his", "her", "their", "our",
  "your", "my", "itself", "himself", "herself", "themselves", "ourselves",

  // Common verbs - be forms (8)
  "is", "are", "was", "were", "be", "been", "being", "am",

  // Common verbs - have forms (4)
  "has", "have", "had", "having",

  // Common verbs - do forms (5)
  "do", "does", "did", "doing", "done",

  // Modal verbs (9)
  "can", "could", "may", "might", "must", "shall", "should",
  "will", "would",

  // Other common words (40)
  "not", "no", "only", "own", "same", "also", "very", "just",
  "then", "there", "here", "now", "well", "still", "even",
  "too", "much", "many", "often", "always", "never", "ever",
  "however", "therefore", "thus", "hence", "further", "moreover",
  "rather", "already", "almost", "once", "twice", "how", "where",
  "per", "via", "one", "two", "new"
];

module.exports = { stopWords };
