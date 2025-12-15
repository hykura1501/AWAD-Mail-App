package fuzzy

import (
	"strings"
	"unicode"
)

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
				d[i-1][j]+1,   // deletion
				d[i][j-1]+1,   // insertion
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

	// If query is contained in text, it's a match
	if strings.Contains(text, query) {
		return true
	}

	// Check if any word in text fuzzy-matches the query
	words := strings.Fields(text)
	for _, word := range words {
		if LevenshteinDistance(query, word) <= threshold {
			return true
		}
		// Check if word starts with query (partial match)
		if strings.HasPrefix(word, query) {
			return true
		}
	}

	// Check overall distance for short texts
	if len(text) < 50 {
		distance := LevenshteinDistance(query, text)
		// Allow more tolerance for longer queries
		maxDistance := threshold + len(query)/5
		if distance <= maxDistance {
			return true
		}
	}

	return false
}

// CalculateRelevanceScore scores how relevant an email is to a query
// Higher score = more relevant
// Searches subject, from, from_name fields
func CalculateRelevanceScore(query, subject, from, fromName string) float64 {
	query = normalizeString(query)
	score := 0.0

	// Exact match in subject (highest weight)
	subjectNorm := normalizeString(subject)
	if strings.Contains(subjectNorm, query) {
		score += 100.0
		// Bonus for exact word match
		if containsWord(subjectNorm, query) {
			score += 50.0
		}
	} else {
		// Fuzzy match in subject
		subjectWords := strings.Fields(subjectNorm)
		for _, word := range subjectWords {
			dist := LevenshteinDistance(query, word)
			if dist <= 2 {
				score += 50.0 - float64(dist)*15
			}
			if strings.HasPrefix(word, query) {
				score += 40.0
			}
		}
	}

	// Exact match in sender name
	fromNameNorm := normalizeString(fromName)
	if strings.Contains(fromNameNorm, query) {
		score += 80.0
		if containsWord(fromNameNorm, query) {
			score += 30.0
		}
	} else {
		// Fuzzy match in sender name
		nameWords := strings.Fields(fromNameNorm)
		for _, word := range nameWords {
			dist := LevenshteinDistance(query, word)
			if dist <= 2 {
				score += 40.0 - float64(dist)*12
			}
			if strings.HasPrefix(word, query) {
				score += 35.0
			}
		}
	}

	// Match in email address
	fromNorm := normalizeString(from)
	if strings.Contains(fromNorm, query) {
		score += 60.0
	} else {
		// Check email local part
		localPart := fromNorm
		if idx := strings.Index(fromNorm, "@"); idx > 0 {
			localPart = fromNorm[:idx]
		}
		if strings.HasPrefix(localPart, query) {
			score += 30.0
		}
	}

	return score
}

// FuzzyMatchEmail checks if an email matches the query
func FuzzyMatchEmail(query, subject, from, fromName, body string) bool {
	// Typo tolerance threshold based on query length
	threshold := 2
	if len(query) <= 3 {
		threshold = 1
	} else if len(query) >= 8 {
		threshold = 3
	}

	// Check subject
	if FuzzyMatch(query, subject, threshold) {
		return true
	}

	// Check sender name
	if FuzzyMatch(query, fromName, threshold) {
		return true
	}

	// Check sender email
	if FuzzyMatch(query, from, threshold) {
		return true
	}

	// Optionally check body (first 500 chars for performance)
	if len(body) > 0 {
		bodySnippet := body
		if len(bodySnippet) > 500 {
			bodySnippet = bodySnippet[:500]
		}
		if FuzzyMatch(query, bodySnippet, threshold) {
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

// normalizeString converts to lowercase and handles unicode
func normalizeString(s string) string {
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
