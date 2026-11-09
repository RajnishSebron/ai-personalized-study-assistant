export type ExtractedPage = { page: number; text: string };
export type TextChunk = { content: string; page_number: number; section_heading: string | null; chunk_index: number };

/** Character-based chunking is used to keep ingestion predictable without a tokenizer dependency. */
export function chunkText(pages: ExtractedPage[], maxChars = 3200, overlap = 400): TextChunk[] {
  if (maxChars <= overlap || overlap < 0) throw new Error("maxChars must be greater than overlap.");
  const chunks: TextChunk[] = [];
  let index = 0;
  for (const page of pages) {
    const normalized = page.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    if (!normalized) continue;
    const paragraphs = normalized.split(/\n{2,}|(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
    let current = "";
    let heading: string | null = null;
    for (const part of paragraphs) {
      if (part.length < 140 && /^(unit|chapter|module|section|topic)\s+[\w.-]+/i.test(part)) heading = part;
      if (part.length > maxChars) {
        if (current.trim()) { chunks.push({ content: current.trim(), page_number: page.page, section_heading: heading, chunk_index: index++ }); current = ""; }
        let offset = 0;
        while (offset < part.length) {
          const text = part.slice(offset, offset + maxChars).trim();
          if (text) chunks.push({ content: text, page_number: page.page, section_heading: heading, chunk_index: index++ });
          if (offset + maxChars >= part.length) break;
          offset += maxChars - overlap;
        }
        continue;
      }
      if (current && current.length + part.length + 1 > maxChars) {
        chunks.push({ content: current.trim(), page_number: page.page, section_heading: heading, chunk_index: index++ });
        current = `${current.slice(-overlap)} ${part}`;
      } else current += `${current ? " " : ""}${part}`;
    }
    if (current.trim()) chunks.push({ content: current.trim(), page_number: page.page, section_heading: heading, chunk_index: index++ });
  }
  return chunks;
}
