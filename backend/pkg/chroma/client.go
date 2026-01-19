package chroma

import (
	"context"
	"fmt"
	"log"
	"os"

	"ga03-backend/pkg/config"

	chroma "github.com/amikos-tech/chroma-go/pkg/api/v2"
	"github.com/amikos-tech/chroma-go/pkg/embeddings/gemini"
)

type ChromaClient struct {
	client     chroma.Client
	embedFunc  *gemini.GeminiEmbeddingFunction
	config     *config.Config
	collection chroma.Collection // Pre-created collection
}

func NewChromaClient(cfg *config.Config) (*ChromaClient, error) {
	if cfg.ChromaAPIKey == "" {
		return nil, fmt.Errorf("CHROMA_API_KEY is required")
	}

	// Set environment variable for Gemini API key if needed
	if cfg.GeminiApiKey != "" {
		os.Setenv("GEMINI_API_KEY", cfg.GeminiApiKey)
	}

	// Create Gemini embedding function
	embedFunc, err := gemini.NewGeminiEmbeddingFunction(
		gemini.WithEnvAPIKey(),
		gemini.WithDefaultModel("text-embedding-004"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini embedding function: %w", err)
	}

	// Create Chroma Cloud client
	// Use Chroma Cloud endpoint - https://api.trychroma.com:8000/api/v2
	var client chroma.Client
	if cfg.ChromaDatabase != "" && cfg.ChromaTenant != "" {
		client, err = chroma.NewHTTPClient(
			chroma.WithBaseURL(chroma.ChromaCloudEndpoint),
			chroma.WithCloudAPIKey(cfg.ChromaAPIKey),
			chroma.WithDatabaseAndTenant(cfg.ChromaDatabase, cfg.ChromaTenant),
		)
	} else if cfg.ChromaTenant != "" {
		client, err = chroma.NewHTTPClient(
			chroma.WithBaseURL(chroma.ChromaCloudEndpoint),
			chroma.WithCloudAPIKey(cfg.ChromaAPIKey),
			chroma.WithTenant(cfg.ChromaTenant),
		)
	} else {
		client, err = chroma.NewHTTPClient(
			chroma.WithBaseURL(chroma.ChromaCloudEndpoint),
			chroma.WithCloudAPIKey(cfg.ChromaAPIKey),
		)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create Chroma client: %w", err)
	}

	// Create collection once during initialization
	ctx := context.Background()
	collection, err := client.GetOrCreateCollection(
		ctx,
		"email", // collection name
		chroma.WithEmbeddingFunctionCreate(embedFunc),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create collection: %w", err)
	}

	log.Printf("Initialized Chroma client with collection: emails")

	return &ChromaClient{
		client:     client,
		embedFunc:  embedFunc,
		config:     cfg,
		collection: collection,
	}, nil
}

// GetCollection returns the pre-created collection
func (c *ChromaClient) GetCollection() chroma.Collection {
	return c.collection
}

func (c *ChromaClient) AddEmailEmbedding(ctx context.Context, collectionName, emailID, userID, subject, body string) error {
	collection := c.GetCollection()

	// Combine subject and body for embedding
	text := fmt.Sprintf("Subject: %s\n\nBody: %s", subject, body)
	if len(text) > 10000 {
		// Truncate if too long (embedding models have token limits)
		text = text[:10000]
	}

	// Create metadata from map
	metadata, err := chroma.NewDocumentMetadataFromMap(map[string]interface{}{
		"user_id":  userID,
		"email_id": emailID,
		"subject":  subject,
	})
	if err != nil {
		return fmt.Errorf("failed to create metadata: %w", err)
	}

	// Add document with metadata
	err = collection.Add(
		ctx,
		chroma.WithIDs(chroma.DocumentID(emailID)),
		chroma.WithMetadatas(metadata),
		chroma.WithTexts(text),
	)
	if err != nil {
		return fmt.Errorf("failed to add email embedding: %w", err)
	}

	return nil
}

// UpsertEmailEmbedding upserts email embedding (updates if exists, adds if not)
// This prevents duplicates by using email ID as the document ID
func (c *ChromaClient) UpsertEmailEmbedding(ctx context.Context, collectionName, emailID, userID, subject, body string) error {
	collection := c.GetCollection()

	// Combine subject and body for embedding
	text := fmt.Sprintf("Subject: %s\n\nBody: %s", subject, body)
	if len(text) > 10000 {
		// Truncate if too long (embedding models have token limits)
		text = text[:10000]
	}

	// Create metadata from map
	metadata, err := chroma.NewDocumentMetadataFromMap(map[string]interface{}{
		"user_id":  userID,
		"email_id": emailID,
		"subject":  subject,
	})
	if err != nil {
		return fmt.Errorf("failed to create metadata: %w", err)
	}

	// Upsert document with metadata (will update if emailID exists, add if not)
	err = collection.Upsert(
		ctx,
		chroma.WithIDs(chroma.DocumentID(emailID)),
		chroma.WithMetadatas(metadata),
		chroma.WithTexts(text),
	)
	if err != nil {
		return fmt.Errorf("failed to upsert email embedding: %w", err)
	}

	return nil
}

func (c *ChromaClient) SemanticSearch(ctx context.Context, collectionName, userID, query string, limit int) ([]string, []float64, error) {
	log.Printf("[SemanticSearch] Starting search - userID: %s, query: %s, limit: %d", userID, query, limit)

	collection := c.GetCollection()
	if collection == nil {
		log.Printf("[SemanticSearch] ERROR: Collection is nil")
		return nil, nil, fmt.Errorf("collection is nil")
	}

	// Create where filter for user_id using EqString
	where := chroma.EqString("user_id", userID)
	log.Printf("[SemanticSearch] Created where filter for user_id: %s", userID)

	// Query the collection
	log.Printf("[SemanticSearch] Querying collection...")
	results, err := collection.Query(
		ctx,
		chroma.WithQueryTexts(query),
		chroma.WithNResults(limit),
		chroma.WithWhereQuery(where),
	)
	if err != nil {
		log.Printf("[SemanticSearch] ERROR querying collection: %v", err)
		return nil, nil, fmt.Errorf("failed to query collection: %w", err)
	}
	log.Printf("[SemanticSearch] Query completed successfully")

	// Extract results
	if results == nil || results.CountGroups() == 0 {
		log.Printf("[SemanticSearch] No results found (results is nil or CountGroups is 0)")
		return []string{}, []float64{}, nil
	}

	// Get the first group of results
	idGroups := results.GetIDGroups()
	distanceGroups := results.GetDistancesGroups()
	log.Printf("[SemanticSearch] Found %d ID groups, %d distance groups", len(idGroups), len(distanceGroups))

	if len(idGroups) == 0 || len(idGroups[0]) == 0 {
		log.Printf("[SemanticSearch] No IDs in first group")
		return []string{}, []float64{}, nil
	}

	// Convert DocumentIDs to strings
	emailIDs := make([]string, 0, len(idGroups[0]))
	for _, id := range idGroups[0] {
		emailIDs = append(emailIDs, string(id))
	}
	log.Printf("[SemanticSearch] Converted %d email IDs", len(emailIDs))

	distances := []float64{}
	if len(distanceGroups) > 0 && len(distanceGroups[0]) > 0 {
		// Convert embeddings.Distances to []float64
		for _, d := range distanceGroups[0] {
			distances = append(distances, float64(d))
		}
		log.Printf("[SemanticSearch] Converted %d distances", len(distances))
	}

	log.Printf("[SemanticSearch] Returning %d results", len(emailIDs))
	return emailIDs, distances, nil
}

func (c *ChromaClient) DeleteEmailEmbedding(ctx context.Context, collectionName, emailID string) error {
	collection := c.GetCollection()

	err := collection.Delete(ctx, chroma.WithIDsDelete(chroma.DocumentID(emailID)))
	if err != nil {
		return fmt.Errorf("failed to delete email embedding: %w", err)
	}

	return nil
}
