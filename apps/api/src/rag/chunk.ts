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

    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
