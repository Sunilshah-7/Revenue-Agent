import { env } from "./env";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ChatCompletionStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

async function groqRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${GROQ_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Groq request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export async function createEmbeddings(
  input: string | string[],
): Promise<number[][]> {
  const payload = {
    model: "nomic-embed-text-v1.5",
    input,
  };

  const result = await groqRequest<EmbeddingResponse>("/embeddings", payload);
  return result.data.map((d) => d.embedding);
}

export async function createCompletion(
  messages: ChatMessage[],
): Promise<string> {
  const payload = {
    model: "llama-3.3-70b-versatile",
    messages,
    temperature: 0.2,
  };

  const result = await groqRequest<ChatCompletionResponse>(
    "/chat/completions",
    payload,
  );
  return result.choices[0]?.message?.content ?? "";
}

export async function* streamCompletion(
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,
      stream: true,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Groq request failed (${response.status}): ${message}`);
  }

  if (!response.body) {
    throw new Error("Groq streaming response did not include a body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return null;
    }

    const data = trimmed.slice("data:".length).trim();
    if (data === "[DONE]") {
      return "[DONE]";
    }

    const parsed = JSON.parse(data) as ChatCompletionStreamChunk;
    return parsed.choices?.[0]?.delta?.content ?? null;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const token = parseLine(line);
      if (token === "[DONE]") {
        return;
      }
      if (token) {
        yield token;
      }
    }
  }

  buffer += decoder.decode();
  for (const line of buffer.split(/\r?\n/)) {
    const token = parseLine(line);
    if (token === "[DONE]") {
      return;
    }
    if (token) {
      yield token;
    }
  }
}
