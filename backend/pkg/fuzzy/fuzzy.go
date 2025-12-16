package fuzzy

import (
	"strings"
	"unicode"
)

// BuildGmailSearchQuery builds a Gmail search query from user query for pre-filtering
// This helps reduce the number of emails that need fuzzy matching
// Gmail search syntax: https://support.google.com/mail/answer/7190
func BuildGmailSearchQuery(userQuery string) string {
	userQuery = strings.TrimSpace(userQuery)
	if len(userQuery) == 0 {
		return ""
	}

	// Split query into words
	words := strings.Fields(userQuery)
	if len(words) == 0 {
		return ""
	}

	// Build Gmail search query
	// Format: (subject:"word1" OR subject:"word2" OR from:"word1" OR from:"word2")
	// This will pre-filter emails that contain any of the words in subject or from

	var parts []string

	// For single word, search in subject and from
	if len(words) == 1 {
		word := words[0]
		// Escape quotes in word
		word = strings.ReplaceAll(word, `"`, `\"`)
		parts = append(parts, `subject:"`+word+`"`)
		parts = append(parts, `from:"`+word+`"`)
	} else {
		// For multiple words, search for any word in subject or from
		// This is more lenient - we'll do exact matching in fuzzy later
		for _, word := range words {
			if len(word) >= 2 { // Skip very short words
				word = strings.ReplaceAll(word, `"`, `\"`)
				parts = append(parts, `subject:"`+word+`"`)
				parts = append(parts, `from:"`+word+`"`)
			}
		}
	}

	if len(parts) == 0 {
		return ""
	}

	// Combine with OR - Gmail will return emails matching any of these
	return "(" + strings.Join(parts, " OR ") + ")"
}

// QuickFilter performs a simple contains check for pre-filtering
// Returns true if email might match (for further fuzzy matching)
// This is much faster than fuzzy matching and helps reduce the dataset
func QuickFilter(query, subject, from, fromName string) bool {
	query = normalizeString(query)
	if len(query) == 0 {
		return false
	}

	subjectNorm := normalizeString(subject)
	fromNorm := normalizeString(from)
	fromNameNorm := normalizeString(fromName)

	// Check if any word in query appears in subject, from, or fromName
	queryWords := strings.Fields(query)
	for _, word := range queryWords {
		if len(word) < 2 {
			continue
		}
		if strings.Contains(subjectNorm, word) ||
			strings.Contains(fromNorm, word) ||
			strings.Contains(fromNameNorm, word) {
			return true
		}
	}

	return false
}

// LevenshteinDistance calculates the edit distance between two strings
// This measures how many single-character edits (insertions, deletions, or substitutions)
// are required to change one string into another
func LevenshteinDistance(s1, s2 string) int {
	// Normalize strings: lowercase and remove accents for better matching
	s1 = normalizeString(s1)
	s2 = normalizeString(s2)

	if len(s1) == 0 {
		return len(s2)
	}
	if len(s2) == 0 {
		return len(s1)
	}

	// Create matrix
	r1 := []rune(s1)
	r2 := []rune(s2)
	m := len(r1)
	n := len(r2)

	// Create 2D slice
	d := make([][]int, m+1)
	for i := range d {
		d[i] = make([]int, n+1)
	}

	// Initialize first column
	for i := 0; i <= m; i++ {
		d[i][0] = i
	}
	// Initialize first row
	for j := 0; j <= n; j++ {
		d[0][j] = j
	}

	// Fill the matrix
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			cost := 0
			if r1[i-1] != r2[j-1] {
				cost = 1
			}
			d[i][j] = min3(
				d[i-1][j]+1,      // deletion
				d[i][j-1]+1,      // insertion
				d[i-1][j-1]+cost, // substitution
			)
		}
	}

	return d[m][n]
}

// FuzzyMatch checks if query fuzzy-matches text within a given threshold
// threshold is the maximum allowed edit distance
func FuzzyMatch(query, text string, threshold int) bool {
	query = normalizeString(query)
	text = normalizeString(text)

	// Empty query matches nothing
	if len(query) == 0 {
		return false
	}

	// If query is contained in text, it's a match (exact substring)
	if strings.Contains(text, query) {
		return true
	}

	// For multi-word queries, check if all words match
	queryWords := strings.Fields(query)
	if len(queryWords) > 1 {
		// All words must match somewhere in the text
		for _, qWord := range queryWords {
			if len(qWord) < 2 {
				continue // Skip very short words
			}
			wordMatched := false
			textWords := strings.Fields(text)
			for _, tWord := range textWords {
				if strings.Contains(tWord, qWord) || LevenshteinDistance(qWord, tWord) <= threshold {
					wordMatched = true
					break
				}
			}
			if !wordMatched {
				return false
			}
		}
		return true
	}

	// Single word query: check if any word in text fuzzy-matches
	words := strings.Fields(text)
	for _, word := range words {
		// Exact prefix match (high priority)
		if strings.HasPrefix(word, query) {
			return true
		}
		// Fuzzy match within threshold
		if len(word) > 0 && LevenshteinDistance(query, word) <= threshold {
			return true
		}
		// Check if query is substring of word (for partial matches)
		if len(query) >= 3 && strings.Contains(word, query) {
			return true
		}
	}

	// For short texts, check overall distance
	if len(text) < 100 {
		distance := LevenshteinDistance(query, text)
		// More tolerance for longer queries
		maxDistance := threshold
		if len(query) >= 5 {
			maxDistance = threshold + 1
		}
		if distance <= maxDistance {
			return true
		}
	}

	return false
}

// CalculateRelevanceScore scores how relevant an email is to a query
// Higher score = more relevant
// Searches subject, from, from_name fields with improved scoring
func CalculateRelevanceScore(query, subject, from, fromName string) float64 {
	query = normalizeString(query)
	if len(query) == 0 {
		return 0.0
	}

	score := 0.0
	queryWords := strings.Fields(query)

	// Subject scoring (highest priority)
	subjectNorm := normalizeString(subject)
	if len(queryWords) == 1 {
		// Single word query
		if strings.Contains(subjectNorm, query) {
			score += 100.0
			if containsWord(subjectNorm, query) {
				score += 50.0 // Exact word match bonus
			}
			// Position bonus: matches at start get higher score
			if strings.HasPrefix(subjectNorm, query) {
				score += 30.0
			}
		} else {
			// Fuzzy match in subject
			subjectWords := strings.Fields(subjectNorm)
			bestMatch := 999
			for _, word := range subjectWords {
				if strings.HasPrefix(word, query) {
					score += 40.0
					break
				}
				dist := LevenshteinDistance(query, word)
				if dist <= 2 && dist < bestMatch {
					bestMatch = dist
					score += 50.0 - float64(dist)*15
				}
			}
		}
	} else {
		// Multi-word query: check how many words match
		matchedWords := 0
		subjectWords := strings.Fields(subjectNorm)
		for _, qWord := range queryWords {
			if len(qWord) < 2 {
				continue
			}
			for _, sWord := range subjectWords {
				if strings.Contains(sWord, qWord) || LevenshteinDistance(qWord, sWord) <= 2 {
					matchedWords++
					break
				}
			}
		}
		if matchedWords > 0 {
			matchRatio := float64(matchedWords) / float64(len(queryWords))
			score += 100.0 * matchRatio
			if matchedWords == len(queryWords) {
				score += 50.0 // All words matched bonus
			}
		}
	}

	// Sender name scoring
	fromNameNorm := normalizeString(fromName)
	if len(queryWords) == 1 {
		if strings.Contains(fromNameNorm, query) {
			score += 80.0
			if containsWord(fromNameNorm, query) {
				score += 30.0
			}
			if strings.HasPrefix(fromNameNorm, query) {
				score += 20.0
			}
		} else {
			nameWords := strings.Fields(fromNameNorm)
			for _, word := range nameWords {
				if strings.HasPrefix(word, query) {
					score += 35.0
					break
				}
				dist := LevenshteinDistance(query, word)
				if dist <= 2 {
					score += 40.0 - float64(dist)*12
					break
				}
			}
		}
	} else {
		// Multi-word: check name
		matchedWords := 0
		nameWords := strings.Fields(fromNameNorm)
		for _, qWord := range queryWords {
			if len(qWord) < 2 {
				continue
			}
			for _, nWord := range nameWords {
				if strings.Contains(nWord, qWord) || LevenshteinDistance(qWord, nWord) <= 2 {
					matchedWords++
					break
				}
			}
		}
		if matchedWords > 0 {
			matchRatio := float64(matchedWords) / float64(len(queryWords))
			score += 80.0 * matchRatio
		}
	}

	// Email address scoring (lower priority)
	fromNorm := normalizeString(from)
	if strings.Contains(fromNorm, query) {
		score += 60.0
		// Check email local part
		if idx := strings.Index(fromNorm, "@"); idx > 0 {
			localPart := fromNorm[:idx]
			if strings.Contains(localPart, query) {
				score += 20.0
				if strings.HasPrefix(localPart, query) {
					score += 10.0
				}
			}
		}
	}

	return score
}

// FuzzyMatchEmail checks if an email matches the query
// Returns true if query matches any of: subject, from, fromName, or body
func FuzzyMatchEmail(query, subject, from, fromName, body string) bool {
	query = normalizeString(query)

	// Empty or very short queries don't match
	if len(query) == 0 || len(strings.TrimSpace(query)) == 0 {
		return false
	}

	// Calculate dynamic threshold based on query length
	threshold := 2
	queryLen := len(strings.TrimSpace(query))
	if queryLen <= 2 {
		threshold = 0 // Very short queries need exact match
	} else if queryLen <= 3 {
		threshold = 1
	} else if queryLen >= 8 {
		threshold = 3
	}

	// Check subject (highest priority)
	if len(subject) > 0 && FuzzyMatch(query, subject, threshold) {
		return true
	}

	// Check sender name
	if len(fromName) > 0 && FuzzyMatch(query, fromName, threshold) {
		return true
	}

	// Check sender email (check local part more carefully)
	if len(from) > 0 {
		if FuzzyMatch(query, from, threshold) {
			return true
		}
		// Also check local part separately
		if idx := strings.Index(from, "@"); idx > 0 {
			localPart := from[:idx]
			if FuzzyMatch(query, localPart, threshold) {
				return true
			}
		}
	}

	// Check body (first 1000 chars for better coverage, but lower priority)
	if len(body) > 0 {
		bodySnippet := body
		if len(bodySnippet) > 1000 {
			bodySnippet = bodySnippet[:1000]
		}
		// Use slightly higher threshold for body search
		bodyThreshold := threshold + 1
		if bodyThreshold > 3 {
			bodyThreshold = 3
		}
		if FuzzyMatch(query, bodySnippet, bodyThreshold) {
			return true
		}
	}

	return false
}

// Helper functions

func min3(a, b, c int) int {
	if a < b {
		if a < c {
			return a
		}
		return c
	}
	if b < c {
		return b
	}
	return c
}

// normalizeString converts to lowercase, trims whitespace, and handles unicode
func normalizeString(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ToLower(s)
	// Remove extra whitespace
	s = strings.Join(strings.Fields(s), " ")
	return s
}

// containsWord checks if text contains query as a whole word
func containsWord(text, query string) bool {
	words := strings.Fields(text)
	for _, word := range words {
		if word == query {
			return true
		}
	}
	return false
}

// removeAccents removes diacritical marks from a string
// Useful for matching Vietnamese text without accents
func removeAccents(s string) string {
	var result strings.Builder
	for _, r := range s {
		if unicode.Is(unicode.Mn, r) { // Mn: Mark, nonspacing
			continue
		}
		// Map common Vietnamese characters to ASCII equivalents
		switch r {
		case 'á', 'à', 'ả', 'ã', 'ạ', 'ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ', 'â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ':
			result.WriteRune('a')
		case 'é', 'è', 'ẻ', 'ẽ', 'ẹ', 'ê', 'ế', 'ề', 'ể', 'ễ', 'ệ':
			result.WriteRune('e')
		case 'í', 'ì', 'ỉ', 'ĩ', 'ị':
			result.WriteRune('i')
		case 'ó', 'ò', 'ỏ', 'õ', 'ọ', 'ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ', 'ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ':
			result.WriteRune('o')
		case 'ú', 'ù', 'ủ', 'ũ', 'ụ', 'ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự':
			result.WriteRune('u')
		case 'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ':
			result.WriteRune('y')
		case 'đ':
			result.WriteRune('d')
		default:
			result.WriteRune(r)
		}
	}
	return result.String()
}
