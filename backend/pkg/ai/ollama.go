package ai

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

// OllamaService implements SummarizerService using Ollama local LLM
type OllamaService struct {
	getBaseURL func() string // Dynamic getter for BaseURL
	getModel   func() string // Dynamic getter for Model
}

// NewOllamaService creates a new Ollama service
func NewOllamaService(baseURL, model string) *OllamaService {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if model == "" {
		model = "llama3"
	}
	// Use static values (for backward compatibility when no runtime config)
	return &OllamaService{
		getBaseURL: func() string { return baseURL },
		getModel:   func() string { return model },
	}
}

// NewOllamaServiceWithGetters creates a new Ollama service with dynamic getters
func NewOllamaServiceWithGetters(getBaseURL, getModel func() string) *OllamaService {
	return &OllamaService{
		getBaseURL: getBaseURL,
		getModel:   getModel,
	}
}

// SummarizeEmail implements SummarizerService
func (o *OllamaService) SummarizeEmail(ctx context.Context, emailText string) (string, error) {
	url := o.getBaseURL() + "/api/generate"

	// Enhanced Vietnamese prompt with professional prompting techniques
	// (Same as Gemini for consistency across providers)
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
		"model":  o.getModel(),
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.3,
			"num_predict": 100, // Shorter output
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ollama API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Response string `json:"response"`
		Done     bool   `json:"done"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	return result.Response, nil
}

// ExtractTasksFromEmail implements SummarizerService for task extraction
func (o *OllamaService) ExtractTasksFromEmail(ctx context.Context, emailText string) ([]TaskExtraction, error) {
	url := o.getBaseURL() + "/api/generate"

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

CHỈ trả về JSON array, KHÔNG có text khác.

EMAIL:
%s

JSON OUTPUT:`, currentDate, emailText)

	payload := map[string]interface{}{
		"model":  o.getModel(),
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.2,
			"num_predict": 500,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Extract JSON from response
	responseText := strings.TrimSpace(result.Response)
	jsonStart := strings.Index(responseText, "[")
	jsonEnd := strings.LastIndex(responseText, "]")
	if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
		responseText = responseText[jsonStart : jsonEnd+1]
	}

	var rawTasks []struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		DueDate     string `json:"due_date"`
		Priority    string `json:"priority"`
	}

	if err := json.Unmarshal([]byte(responseText), &rawTasks); err != nil {
		return nil, fmt.Errorf("failed to parse task JSON: %v", err)
	}

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
			formats := []string{time.RFC3339, "2006-01-02T15:04:05Z", "2006-01-02T15:04:05", "2006-01-02"}
			for _, format := range formats {
				if t, err := time.Parse(format, rt.DueDate); err == nil {
					task.DueDate = &t
					break
				}
			}
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

	return nil
}

// GenerateSynonyms generates synonyms for a query using Ollama
func (o *OllamaService) GenerateSynonyms(ctx context.Context, word string) ([]string, error) {
	url := o.getBaseURL() + "/api/generate"

	prompt := fmt.Sprintf(`Tìm các "RELATED CONCEPTS" (khái niệm liên quan), "SPECIFIC EXAMPLES" (ví dụ cụ thể), và "DOMAIN TERMS" (thuật ngữ chuyên ngành) cho từ khóa sau trong ngữ cảnh EMAIL CÔNG VIỆC: "%s"
	
	Mục tiêu: Mở rộng tìm kiếm sang các từ khóa mà không nhất thiết phải đồng nghĩa hoàn toàn, nhưng có liên quan mật thiết về mặt ngữ nghĩa/ngữ cảnh.
	
	Ví dụ:
	- Input "money" -> Output: ["invoice", "salary", "payment", "transaction", "billing", "cost", "chuyển khoản", "lương", "hóa đơn", "chi phí"]
	
	Yêu cầu:
	1. Trả về kết quả dưới dạng JSON Array các string.
	2. Bao gồm cả tiếng Anh và tiếng Việt nếu phù hợp.
	3. CHỈ trả về JSON Array, không thêm text khác.
	4. Tối đa 15 từ quan trọng nhất.`, word)

	payload := map[string]interface{}{
		"model":  o.getModel(),
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.2, // Lower temperature for more consistent results
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Extract JSON from response
	responseText := strings.TrimSpace(result.Response)
	// Clean up markdown code blocks if present
	if strings.HasPrefix(responseText, "```json") {
		responseText = strings.TrimPrefix(responseText, "```json")
		responseText = strings.TrimSuffix(responseText, "```")
	} else if strings.HasPrefix(responseText, "```") {
		responseText = strings.TrimPrefix(responseText, "```")
		responseText = strings.TrimSuffix(responseText, "```")
	}
	responseText = strings.TrimSpace(responseText)

	jsonStart := strings.Index(responseText, "[")
	jsonEnd := strings.LastIndex(responseText, "]")
	if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
		responseText = responseText[jsonStart : jsonEnd+1]
	}

	var synonyms []string
	if err := json.Unmarshal([]byte(responseText), &synonyms); err != nil {
		// If JSON parse fails, try fallback similar to Gemini implementation
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

