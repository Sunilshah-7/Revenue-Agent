// Per the Active Decisions Log / tech stack table, embeddings are a local
// deterministic hashing scheme rather than a call to a hosted embeddings
// API — this is effectively a hashing-trick / feature-hashing bag-of-
// n-grams vectorizer, not a learned semantic embedding. It has no network
// dependency and no metered cost, but its notion of "similarity" is purely
// lexical overlap (shared words/bigrams), not real semantic meaning.
const EMBEDDING_DIMENSIONS = 768;

// FNV-1a-style hash, salted with `seed` so the same token can be hashed
// into different independent values (see the two different seeds used for
// "which dimension" vs "which sign" below).
function hashToken(token: string, seed: number): number {
  let hash = 2166136261 ^ seed;

  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function embedOne(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = tokenize(text);

  // Empty input still needs a valid unit vector (not a zero vector, which
  // would break cosine distance/normalization), so it's pinned to a fixed
  // basis vector.
  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    // Hash each unigram into one of 768 dimensions (seed 0) with a random
    // +/-1 sign (seed 1) — this is the "hashing trick": no vocabulary table
    // is needed, dimensions are just hash buckets, and collisions are
    // accepted as noise.
    const hash = hashToken(token, 0);
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = hashToken(token, 1) % 2 === 0 ? 1 : -1;
    vector[index] += sign;

    // Also hash adjacent-word bigrams (seeds 2/3, half-weighted) into the
    // same space, so word order/local context contributes a little beyond
    // pure bag-of-words.
    const next = tokens[i + 1];
    if (next) {
      const bigram = `${token}:${next}`;
      const bigramHash = hashToken(bigram, 2);
      const bigramIndex = bigramHash % EMBEDDING_DIMENSIONS;
      const bigramSign = hashToken(bigram, 3) % 2 === 0 ? 0.5 : -0.5;
      vector[bigramIndex] += bigramSign;
    }
  }

  // L2-normalize so cosine distance (used in rag/retrieve.ts and the HNSW
  // index) behaves consistently regardless of input length.
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return vector.map((value) => value / norm);
}

// Accepts a single string or a batch; always returns a batch of vectors so
// callers (embed worker vs. single-query retrieval) share one signature.
export async function embedText(input: string | string[]): Promise<number[][]> {
  const values = Array.isArray(input) ? input : [input];
  return values.map(embedOne);
}
