import { Hono } from "hono";
import { z } from "zod";
import { createCompletion } from "../lib/groq";
import { retrieveTopChunks } from "../rag/retrieve";

const querySchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(20).optional(),
});

export const queryRouter = new Hono();

queryRouter.post("/api/v1/query", async (c) => {
  try {
    const body = await c.req.json();
    const { query, topK } = querySchema.parse(body);

    const chunks = await retrieveTopChunks(query, topK ?? 5);
    const context = chunks
      .map(
        (chunk, index) =>
          `[#${index + 1}] score=${chunk.score.toFixed(4)}\n${chunk.content}`,
      )
      .join("\n\n");

    const answer = await createCompletion([
      {
        role: "system",
        content:
          "Answer using only the provided context. If context is insufficient, state that clearly.",
      },
      {
        role: "user",
        content: `Query:\n${query}\n\nContext:\n${context}`,
      },
    ]);

    return c.json({ answer, chunks });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      400,
    );
  }
});
