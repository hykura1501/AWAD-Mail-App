import { z } from "zod";

/**
 * Environment variable schema using Zod for runtime validation.
 * This ensures that all required environment variables are present and correctly typed.
 * 
 * If any required variable is missing, the app will fail fast at startup with a clear error.
 */
const envSchema = z.object({
  // API Configuration
  VITE_API_URL: z
    .string()
    .url("VITE_API_URL must be a valid URL")
    .describe("Backend API base URL"),

  // Google OAuth Configuration
  VITE_GOOGLE_CLIENT_ID: z
    .string()
    .min(1, "VITE_GOOGLE_CLIENT_ID is required")
    .describe("Google OAuth client ID"),

  // Optional: Development mode flag
  DEV: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether app is in development mode"),

  // Optional: Production mode flag
  PROD: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether app is in production mode"),
});

/**
 * Type for the validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws an error if validation fails.
 */
function validateEnv(): Env {
  try {
    return envSchema.parse({
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      DEV: import.meta.env.DEV,
      PROD: import.meta.env.PROD,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
        .join("\n");
      
      console.error(
        `\n❌ Invalid environment variables:\n${errorMessages}\n\n` +
        `Please check your .env file and ensure all required variables are set.\n`
      );
    }
    throw error;
  }
}

/**
 * Validated environment variables.
 * Use this instead of import.meta.env directly for type-safe access.
 * 
 * @example
 * import { env } from "@/config/env";
 * 
 * const apiUrl = env.VITE_API_URL; // string (type-safe)
 */
export const env = validateEnv();

/**
 * Helper to check if we're in development mode
 */
export const isDev = env.DEV;

/**
 * Helper to check if we're in production mode
 */
export const isProd = env.PROD;
