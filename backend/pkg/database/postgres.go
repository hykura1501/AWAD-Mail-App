package database

import (
	"fmt"
	"log"

	"ga03-backend/pkg/config"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func NewPostgresConnection(cfg *config.Config) (*gorm.DB, error) {
	// 1. Connect to default 'postgres' database to check/create the target DB
	defaultDSN := fmt.Sprintf("host=%s user=%s password=%s dbname=postgres port=%s sslmode=%s",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBPort, cfg.DBSSLMode)

	defaultDB, err := gorm.Open(postgres.Open(defaultDSN), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to default postgres database: %v", err)
	}

	// Check if database exists
	var count int64
	checkQuery := fmt.Sprintf("SELECT count(1) FROM pg_database WHERE datname = '%s'", cfg.DBName)
	if err := defaultDB.Raw(checkQuery).Scan(&count).Error; err != nil {
		return nil, fmt.Errorf("failed to check if database exists: %v", err)
	}

	// Create database if it doesn't exist
	if count == 0 {
		log.Printf("Database %s does not exist. Creating...", cfg.DBName)
		// Close the connection to postgres DB before creating the new one?
		// Actually GORM maintains a pool. But we can just run the CREATE DATABASE command.
		// Note: CREATE DATABASE cannot run inside a transaction block.
		// We need to get the underlying sql.DB to run this command or ensure GORM doesn't wrap it.
		// GORM's Exec usually doesn't wrap in transaction unless specified.

		// However, to be safe and avoid "CREATE DATABASE cannot run inside a transaction block" error,
		// we should ensure we are not in a transaction.

		createCmd := fmt.Sprintf("CREATE DATABASE %s", cfg.DBName)
		if err := defaultDB.Exec(createCmd).Error; err != nil {
			return nil, fmt.Errorf("failed to create database: %v", err)
		}
		log.Printf("Database %s created successfully", cfg.DBName)
	}

	// Close connection to default DB
	sqlDB, err := defaultDB.DB()
	if err == nil {
		sqlDB.Close()
	}

	// 2. Connect to the actual database
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBPort, cfg.DBSSLMode)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		PrepareStmt: false, // Disable prepared statements to avoid "cached plan must not change result type" error when schema changes during development
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %v", err)
	}

	// Deallocate all existing prepared statements to clear any cached plans from previous schema
	// This helps avoid "cached plan must not change result type" errors when schema changes
	sqlDB, err = db.DB()
	if err == nil {
		_, _ = sqlDB.Exec("DEALLOCATE ALL")
	}

	log.Println("Connected to PostgreSQL database successfully")
	return db, nil
}
