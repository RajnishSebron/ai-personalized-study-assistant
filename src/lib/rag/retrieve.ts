import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/rag/embeddings";
export type RetrievedChunk = {
  id: string; content: string; page_number: number | null; section_heading: string | null;
  material_id: string; similarity: number; document_title: string;
};
export async function retrieveChunks(supabase: SupabaseClient, query: string, materialIds?: string[], limit = 6) {
  const vector = await embedQuery(query);
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: vector, match_count: limit, filter_material_ids: materialIds?.length ? materialIds : null
  });
  if (error) throw new Error(`Vector retrieval failed: ${error.message}`);
  return (data || []) as RetrievedChunk[];
}
