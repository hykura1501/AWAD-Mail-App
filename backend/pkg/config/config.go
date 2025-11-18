package config

import (
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                string
	JWTSecret           string
	JWTAccessExpiry    time.Duration
	JWTRefreshExpiry    time.Duration
	GoogleClientID      string
	GoogleClientSecret  string
	GoogleRedirectURI   string
}

func Load() *Config {
	// Load .env file if it exists
	_ = godotenv.Load()

	accessExpiry := 15 * time.Minute
	if exp := os.Getenv("JWT_ACCESS_EXPIRY"); exp != "" {
		if parsed, err := time.ParseDuration(exp); err == nil {
			accessExpiry = parsed
		}
	}

	refreshExpiry := 168 * time.Hour // 7 days
	if exp := os.Getenv("JWT_REFRESH_EXPIRY"); exp != "" {
		if parsed, err := time.ParseDuration(exp); err == nil {
			refreshExpiry = parsed
		}
	}

	return &Config{
		Port:               getEnv("PORT", "8080"),
		JWTSecret:          getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		JWTAccessExpiry:    accessExpiry,
		JWTRefreshExpiry:   refreshExpiry,
		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURI:  getEnv("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/auth/google/callback"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

