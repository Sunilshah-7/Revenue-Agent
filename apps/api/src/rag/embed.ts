import { createEmbeddings } from "../lib/groq";

export async function embedText(input: string | string[]): Promise<number[][]> {
  return createEmbeddings(input);
}
