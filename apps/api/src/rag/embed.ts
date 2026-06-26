const EMBEDDING_DIMENSIONS = 768;

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

  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const hash = hashToken(token, 0);
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = hashToken(token, 1) % 2 === 0 ? 1 : -1;
    vector[index] += sign;

    const next = tokens[i + 1];
    if (next) {
      const bigram = `${token}:${next}`;
      const bigramHash = hashToken(bigram, 2);
      const bigramIndex = bigramHash % EMBEDDING_DIMENSIONS;
      const bigramSign = hashToken(bigram, 3) % 2 === 0 ? 0.5 : -0.5;
      vector[bigramIndex] += bigramSign;
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return vector.map((value) => value / norm);
}

export async function embedText(input: string | string[]): Promise<number[][]> {
  const values = Array.isArray(input) ? input : [input];
  return values.map(embedOne);
}
