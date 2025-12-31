package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type GeminiService struct {
	ApiKey string
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
