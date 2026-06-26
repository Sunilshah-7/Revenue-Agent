export interface TextChunk {
  content: string;
  index: number;
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
  const step = Math.max(1, size - overlap);

  for (let i = 0; i < words.length; i += step) {
    const slice = words
      .slice(i, i + size)
      .join(" ")
      .trim();
    if (slice.length === 0) {
      continue;
    }

    chunks.push({
      content: slice,
      index: chunks.length,
    });

    if (i + size >= words.length) {
      break;
    }
  }

  return chunks;
}
