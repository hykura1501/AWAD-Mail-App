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

	// Vietnamese prompt for short, concise summary
	prompt := fmt.Sprintf(`Tóm tắt email sau đây trong 1-2 câu ngắn gọn bằng tiếng Việt. 
Chỉ nêu ý chính quan trọng nhất, giúp người đọc nắm bắt nhanh nội dung.
Không cần giải thích chi tiết, không cần lời chào.

Email:
%s

Tóm tắt:`, emailText)

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
