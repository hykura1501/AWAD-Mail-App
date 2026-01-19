-- AWAD Mail App Database Initialization Script
-- PostgreSQL 16+
-- 
-- This script will be executed automatically when the database container starts
-- for the first time. GORM's AutoMigrate will create the actual tables and indexes.
-- 
-- This file is just for initial setup like extensions, custom functions, etc.

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy text search (optional, for future features)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set timezone
SET timezone = 'UTC';

-- Create a function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Grant all privileges to sandbox user
GRANT ALL PRIVILEGES ON DATABASE email_dashboard TO sandbox;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO sandbox;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO sandbox;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database initialized successfully!';
    RAISE NOTICE '📊 Database: email_dashboard';
    RAISE NOTICE '👤 User: sandbox';
    RAISE NOTICE '🔑 Password: sandbox';
    RAISE NOTICE '🌐 Host: localhost:5432';
END $$;
