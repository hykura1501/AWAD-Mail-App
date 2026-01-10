package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type GeminiService struct {
	ApiKey string
}

// TaskExtraction represents an extracted task from email
type TaskExtraction struct {
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Priority    string     `json:"priority"`
}

func NewGeminiService(apiKey string) *GeminiService {
	return &GeminiService{ApiKey: apiKey}
}

func (g *GeminiService) SummarizeEmail(ctx context.Context, emailText string) (string, error) {
	// Use gemini-2.5-flash for fast summarization
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + g.ApiKey

	// Enhanced Vietnamese prompt with professional prompting techniques:
	// 1. Role-playing: AI đóng vai trợ lý email chuyên nghiệp
	// 2. Structured output: Format rõ ràng với action items
	// 3. Context awareness: Nhận biết loại email (meeting, task, info...)
	// 4. Actionable: Highlight việc cần làm nếu có
	prompt := fmt.Sprintf(`Bạn là trợ lý email thông minh. Phân tích email sau và tạo tóm tắt HỮU ÍCH giúp user quyết định nhanh.

HƯỚNG DẪN:
- Dòng 1: Tóm tắt ý chính trong 1 câu ngắn gọn
- Dòng 2 (nếu có): "📌 Cần làm: [action item]" hoặc "📅 Deadline: [thời gian]" hoặc "💡 Lưu ý: [điểm quan trọng]"
- Nếu email quảng cáo/spam: chỉ ghi "Quảng cáo từ [tên công ty]"
- Ngôn ngữ: Tiếng Việt, tối đa 2 dòng
- QUAN TRỌNG: Viết đầy đủ, KHÔNG được cắt ngắn với "..." hoặc bỏ lửng câu

VÍ DỤ OUTPUT TỐT:
"Cuộc họp team vào thứ 5 lúc 14h về tiến độ dự án ABC.
📌 Cần làm: Chuẩn bị báo cáo tiến độ trước thứ 4."

EMAIL:
%s

TÓM TẮT:`, emailText)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]string{{"text": prompt}}},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Gemini API error: %s", string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	// Parse summary from response
	if c, ok := result["candidates"].([]interface{}); ok && len(c) > 0 {
		if cand, ok := c[0].(map[string]interface{}); ok {
			if content, ok := cand["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
					if part, ok := parts[0].(map[string]interface{}); ok {
						if text, ok := part["text"].(string); ok {
							return text, nil
						}
					}
				}
			}
		}
	}
	return "", fmt.Errorf("no summary returned")
}

// ExtractTasksFromEmail uses AI to extract actionable tasks from email content
func (g *GeminiService) ExtractTasksFromEmail(ctx context.Context, emailText string) ([]TaskExtraction, error) {
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + g.ApiKey

	// Current date for context
	currentDate := time.Now().Format("2006-01-02")

	prompt := fmt.Sprintf(`Bạn là trợ lý AI chuyên phân tích email để trích xuất các TASK/VIỆC CẦN LÀM.

NGÀY HÔM NAY: %s

HƯỚNG DẪN:
1. Đọc email và tìm TẤT CẢ các việc cần làm, deadline, cuộc họp, reminder
2. Trả về danh sách tasks dưới dạng JSON array
3. Mỗi task cần có: title (bắt buộc), description, due_date (ISO 8601 format nếu có), priority (high/medium/low)
4. Nếu email không có task nào, trả về mảng rỗng []
5. Priority: 
   - high: deadline gấp (trong 24h), urgent, important
   - medium: deadline vài ngày, cần làm sớm
   - low: không gấp, FYI

VÍ DỤ OUTPUT:
[
  {"title": "Nộp báo cáo tiến độ", "description": "Chuẩn bị báo cáo cho cuộc họp team", "due_date": "2024-01-15T14:00:00Z", "priority": "high"},
  {"title": "Review tài liệu", "description": "Đọc và comment tài liệu thiết kế", "priority": "medium"}
]

QUAN TRỌNG: 
- CHỈ trả về JSON array, KHÔNG có text khác
- Nếu email là quảng cáo/spam/newsletter, trả về []
- due_date phải là ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)

EMAIL:
%s

JSON OUTPUT:`, currentDate, emailText)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]string{{"text": prompt}}},
		},
		"generationConfig": map[string]interface{}{
			"temperature": 0.2, // Lower temperature for more deterministic output
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gemini API error: %s", string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	// Parse response
	var responseText string
	if c, ok := result["candidates"].([]interface{}); ok && len(c) > 0 {
		if cand, ok := c[0].(map[string]interface{}); ok {
			if content, ok := cand["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
					if part, ok := parts[0].(map[string]interface{}); ok {
						if text, ok := part["text"].(string); ok {
							responseText = text
						}
					}
				}
			}
		}
	}

	if responseText == "" {
		return nil, fmt.Errorf("no response from AI")
	}

	// Extract JSON from response (in case AI adds extra text)
	responseText = strings.TrimSpace(responseText)
	
	// Try to find JSON array in the response
	jsonStart := strings.Index(responseText, "[")
	jsonEnd := strings.LastIndex(responseText, "]")
	if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
		responseText = responseText[jsonStart : jsonEnd+1]
	}

	// Parse JSON
	var rawTasks []struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		DueDate     string `json:"due_date"`
		Priority    string `json:"priority"`
	}

	if err := json.Unmarshal([]byte(responseText), &rawTasks); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %v, response: %s", err, responseText)
	}

	// Convert to TaskExtraction with proper time parsing
	var tasks []TaskExtraction
	for _, rt := range rawTasks {
		if rt.Title == "" {
			continue
		}

		task := TaskExtraction{
			Title:       rt.Title,
			Description: rt.Description,
			Priority:    rt.Priority,
		}

		if task.Priority == "" {
			task.Priority = "medium"
		}

		if rt.DueDate != "" {
			// Try multiple date formats
			formats := []string{
				time.RFC3339,
				"2006-01-02T15:04:05Z",
				"2006-01-02T15:04:05",
				"2006-01-02",
			}
			for _, format := range formats {
				if t, err := time.Parse(format, rt.DueDate); err == nil {
					task.DueDate = &t
					break
				}
			}
			// Also try regex for relative dates like "tomorrow", "next week"
			if task.DueDate == nil {
				task.DueDate = parseRelativeDate(rt.DueDate)
			}
		}

		tasks = append(tasks, task)
	}

	return tasks, nil
}

// parseRelativeDate attempts to parse relative date expressions
func parseRelativeDate(dateStr string) *time.Time {
	now := time.Now()
	dateStr = strings.ToLower(dateStr)

	if matched, _ := regexp.MatchString(`(tomorrow|ngày mai)`, dateStr); matched {
		t := now.AddDate(0, 0, 1)
		return &t
	}
	if matched, _ := regexp.MatchString(`(next week|tuần sau|tuần tới)`, dateStr); matched {
		t := now.AddDate(0, 0, 7)
		return &t
	}
	if matched, _ := regexp.MatchString(`(next month|tháng sau|tháng tới)`, dateStr); matched {
		t := now.AddDate(0, 1, 0)
		return &t
	}

	return nil
}

// GenerateSynonyms generates synonyms and related terms for a query
func (g *GeminiService) GenerateSynonyms(ctx context.Context, word string) ([]string, error) {
	url := "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + g.ApiKey

	prompt := fmt.Sprintf(`Tìm các "RELATED CONCEPTS" (khái niệm liên quan), "SPECIFIC EXAMPLES" (ví dụ cụ thể), và "DOMAIN TERMS" (thuật ngữ chuyên ngành) cho từ khóa sau trong ngữ cảnh EMAIL CÔNG VIỆC: "%s"
	
	Mục tiêu: Mở rộng tìm kiếm sang các từ khóa mà không nhất thiết phải đồng nghĩa hoàn toàn, nhưng có liên quan mật thiết về mặt ngữ nghĩa/ngữ cảnh.
	
	Ví dụ:
	- Input "money" -> Output: ["invoice", "salary", "payment", "transaction", "billing", "cost", "chuyển khoản", "lương", "hóa đơn", "chi phí"]
	- Input "meeting" -> Output: ["schedule", "calendar", "call", "zoom", "google meet", "agenda", "minues", "lịch họp", "phòng họp"]
	
	Yêu cầu:
	1. Trả về kết quả dưới dạng JSON Array các string.
	2. Bao gồm cả tiếng Anh và tiếng Việt nếu phù hợp.
	3. CHỈ trả về JSON Array, không thêm text khác.
	4. Tối đa 15 từ quan trọng nhất.`, word)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{"parts": []map[string]string{{"text": prompt}}},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gemini API error: %s", string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	// Parse response
	var responseText string
	if c, ok := result["candidates"].([]interface{}); ok && len(c) > 0 {
		if cand, ok := c[0].(map[string]interface{}); ok {
			if content, ok := cand["content"].(map[string]interface{}); ok {
				if parts, ok := content["parts"].([]interface{}); ok && len(parts) > 0 {
					if part, ok := parts[0].(map[string]interface{}); ok {
						if text, ok := part["text"].(string); ok {
							responseText = text
						}
					}
				}
			}
		}
	}

	if responseText == "" {
		return nil, fmt.Errorf("no response from AI")
	}

	// Clean up markdown code blocks if present
	responseText = strings.TrimSpace(responseText)
	if strings.HasPrefix(responseText, "```json") {
		responseText = strings.TrimPrefix(responseText, "```json")
		responseText = strings.TrimSuffix(responseText, "```")
	} else if strings.HasPrefix(responseText, "```") {
		responseText = strings.TrimPrefix(responseText, "```")
		responseText = strings.TrimSuffix(responseText, "```")
	}
	responseText = strings.TrimSpace(responseText)

	var synonyms []string
	if err := json.Unmarshal([]byte(responseText), &synonyms); err != nil {
		// If JSON parse fails, try to split by comma or newlines as fallback
		lines := strings.Split(responseText, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			line = strings.TrimPrefix(line, "- ")
			line = strings.TrimPrefix(line, "* ")
			if line != "" {
				synonyms = append(synonyms, line)
			}
		}
		if len(synonyms) == 0 {
			return nil, fmt.Errorf("failed to parse synonyms: %v", err)
		}
	}

	return synonyms, nil
}

