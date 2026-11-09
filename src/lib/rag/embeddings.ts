import { gemini, embeddingModel, embeddingDimensions } from "@/lib/gemini/client";
async function embed(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[]> {
  const result = await gemini().models.embedContent({
    model: embeddingModel(), contents: text,
    config: { outputDimensionality: embeddingDimensions(), taskType }
  });
  const vector = result.embeddings?.[0]?.values;
  if (!vector?.length || vector.length !== embeddingDimensions()) throw new Error("Embedding provider returned an unexpected vector dimension.");
  return vector;
}
export const embedDocument = (text: string) => embed(text, "RETRIEVAL_DOCUMENT");
export const embedQuery = (text: string) => embed(text, "RETRIEVAL_QUERY");
