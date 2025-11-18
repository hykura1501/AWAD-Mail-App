# Backend API

Go backend with Clean Architecture implementing authentication and email API.

## Setup

1. Install dependencies:
```bash
go mod download
```

2. Create `.env` file:
```env
PORT=8080
JWT_SECRET=your-secret-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=168h
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
```

3. Run:
```bash
go run main.go
```

## Architecture

- **entity/**: Domain models (User, Email, Mailbox)
- **repository/**: Data access layer (in-memory implementation)
- **usecase/**: Business logic
- **delivery/http/**: HTTP handlers, middleware, routes
- **config/**: Configuration management

## API Endpoints

See main README.md for API documentation.

