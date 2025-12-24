# Build stage
FROM golang:1.24-bookworm AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application with CGO enabled (required for libtokenizers)
RUN CGO_ENABLED=1 GOOS=linux go build -o main ./main.go

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install ca-certificates for HTTPS requests
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /app/main .

# Copy .env file if exists (optional, can also use docker-compose)
# COPY .env .

# Expose port (adjust based on your config)
EXPOSE 8080

# Run the application
CMD ["./main"]
