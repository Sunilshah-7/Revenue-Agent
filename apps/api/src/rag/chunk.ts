// First stage of the RAG ingest pipeline (see routes/documents.ts): splits
// a document's full text into ~512-word chunks with 64-word overlap before
// each chunk is embedded and stored in document_chunks. Word-based rather
// than token-based sizing keeps this dependency-free (no tokenizer
// library), at the cost of not exactly matching the LLM's own tokenization.
export interface TextChunk {
  content: string;
  index: number;
  pageHint: number | null;
}

interface ChunkOptions {
  size?: number;
  overlap?: number;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const size = options.size ?? 512;
  const overlap = options.overlap ?? 64;
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < words.length) {
    const maxEnd = Math.min(start + size, words.length);
    let end = maxEnd;

    // Prefer breaking on a sentence boundary rather than mid-sentence:
    // scan backwards from the size-limited cutoff (but no further back than
    // 60% of the target chunk size) for a word ending in ./!/?, so chunks
    // stay semantically coherent instead of always being exactly `size`
    // words long.
    if (maxEnd < words.length) {
      const minSentenceEnd = Math.min(
        maxEnd - 1,
        start + Math.floor(size * 0.6),
      );

      for (let i = maxEnd - 1; i >= minSentenceEnd; i -= 1) {
        if (/[.!?]["')\]]?$/.test(words[i])) {
          end = i + 1;
          break;
        }
      }
    }

    const slice = words
      .slice(start, end)
      .join(" ")
      .trim();
    if (slice.length === 0) {
      break;
    }

    chunks.push({
      content: slice,
      index: chunks.length,
      pageHint: null,
    });

    if (end >= words.length) {
      break;
    }

    // Next chunk starts `overlap` words before this one ended, so context
    // spanning a chunk boundary isn't lost to retrieval; Math.max guards
    // against a zero/negative step if a sentence break landed very early.
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
