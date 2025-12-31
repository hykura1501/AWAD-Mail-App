package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// OllamaService implements SummarizerService using Ollama local LLM
type OllamaService struct {
	BaseURL string // e.g., "http://localhost:11434"
	Model   string // e.g., "llama3", "mistral", "qwen2"
}

// NewOllamaService creates a new Ollama service
func NewOllamaService(baseURL, model string) *OllamaService {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if model == "" {
		model = "llama3"
	}
	return &OllamaService{
		BaseURL: baseURL,
		Model:   model,
	}
}

// SummarizeEmail implements SummarizerService
func (o *OllamaService) SummarizeEmail(ctx context.Context, emailText string) (string, error) {
	url := o.BaseURL + "/api/generate"

	// Enhanced Vietnamese prompt with professional prompting techniques
	// (Same as Gemini for consistency across providers)
	prompt := fmt.Sprintf(`Bạn là trợ lý email thông minh. Phân tích email sau và tạo tóm tắt HỮU ÍCH giúp user quyết định nhanh.

HƯỚNG DẪN:
- Dòng 1: Tóm tắt ý chính trong 1 câu ngắn gọn
- Dòng 2 (nếu có): "📌 Cần làm: [action item]" hoặc "📅 Deadline: [thời gian]" hoặc "💡 Lưu ý: [điểm quan trọng]"
- Nếu email quảng cáo/spam: chỉ ghi "Quảng cáo từ [tên công ty]"
- Ngôn ngữ: Tiếng Việt, tối đa 2 dòng

VÍ DỤ OUTPUT TỐT:
"Cuộc họp team vào thứ 5 lúc 14h về tiến độ dự án ABC.
📌 Cần làm: Chuẩn bị báo cáo tiến độ trước thứ 4."

EMAIL:
%s

TÓM TẮT:`, emailText)

	payload := map[string]interface{}{
		"model":  o.Model,
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
