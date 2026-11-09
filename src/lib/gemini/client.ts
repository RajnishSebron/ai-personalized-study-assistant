import { GoogleGenAI } from "@google/genai";
import { requiredEnv, embeddingDimensions } from "@/lib/env";
export function gemini() { return new GoogleGenAI({ apiKey: requiredEnv("GEMINI_API_KEY") }); }
export const generationModel = () => process.env.GEMINI_GENERATION_MODEL || "gemini-2.5-flash";
export const embeddingModel = () => process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export { embeddingDimensions };
