export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
export function embeddingDimensions(): number {
  const value = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 768);
  if (!Number.isInteger(value) || value < 1 || value > 3072) throw new Error("GEMINI_EMBEDDING_DIMENSIONS must be an integer from 1 to 3072.");
  return value;
}
