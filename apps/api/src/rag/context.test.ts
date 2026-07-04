import { describe, expect, test } from "bun:test";
import { assembleContext } from "./context";
import type { RetrievedChunk } from "./retrieve";

function chunk(
  overrides: Partial<RetrievedChunk> & { content: string },
): RetrievedChunk {
  return {
    doc_id: "doc-1",
    score: 0.5,
    metadata: {},
    ...overrides,
  };
}

describe("assembleContext", () => {
  test("happy path: numbers chunks with score and joins them", () => {
    const result = assembleContext([
      chunk({ content: "first chunk", score: 0.9 }),
      chunk({ content: "second chunk", score: 0.3, doc_id: "doc-2" }),
    ]);

    expect(result.truncated).toBe(false);
    expect(result.usedChunks).toHaveLength(2);
    expect(result.context).toBe(
      "[#1] score=0.9000\nfirst chunk\n\n[#2] score=0.3000\nsecond chunk",
    );
  });

  test("empty input returns empty context with no chunks used", () => {
    const result = assembleContext([]);

    expect(result.context).toBe("");
    expect(result.usedChunks).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  test("deduplicates identical doc_id+content pairs", () => {
    const duplicate = chunk({ content: "same content", score: 0.8 });
    const result = assembleContext([duplicate, { ...duplicate, score: 0.7 }]);

    expect(result.usedChunks).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  test("truncates once the word budget is exceeded, keeping the top match", () => {
    const big = chunk({
      content: Array(10).fill("word").join(" "),
      score: 0.9,
    });
    const small = chunk({
      content: "short",
      score: 0.5,
      doc_id: "doc-2",
    });

    const result = assembleContext([big, small], 10);

    expect(result.usedChunks).toEqual([big]);
    expect(result.truncated).toBe(true);
  });

  test("always keeps the single highest-scored chunk even if it exceeds the budget alone", () => {
    const oversized = chunk({
      content: Array(20).fill("word").join(" "),
      score: 0.9,
    });

    const result = assembleContext([oversized], 5);

    expect(result.usedChunks).toEqual([oversized]);
    expect(result.truncated).toBe(false);
  });
});
