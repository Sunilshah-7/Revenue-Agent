import { Hono } from "hono";
import { z } from "zod";
import { orchestratorAgent } from "../agents/orchestrator";
import { db } from "../db/client";

const createSessionSchema = z.object({
  playbookId: z.string().optional(),
  prospectContext: z.string().min(1),
});

export const sessionsRouter = new Hono();

sessionsRouter.get("/api/v1/sessions", async (c) => {
  const result = await db.query(
    `
      SELECT id, status, input, output, error_message, created_at, updated_at
      FROM sessions
      ORDER BY created_at DESC
      LIMIT 50
    `,
  );

  return c.json({ sessions: result.rows });
});

sessionsRouter.post("/api/v1/sessions", async (c) => {
  try {
    const body = await c.req.json();
    const input = createSessionSchema.parse(body);

    const inserted = await db.query<{ id: string }>(
      `
        INSERT INTO sessions (status, input)
        VALUES ('idle', $1)
        RETURNING id
      `,
      [JSON.stringify(input)],
    );

    const sessionId = inserted.rows[0].id;
    await orchestratorAgent.start(sessionId, input);

    return c.json({ sessionId, status: "researching" }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      400,
    );
  }
});

sessionsRouter.get("/api/v1/sessions/:id", async (c) => {
  const id = c.req.param("id");

  const result = await db.query(
    `
      SELECT id, status, input, output, error_message, created_at, updated_at
      FROM sessions
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );

  if (result.rows.length === 0) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json(result.rows[0]);
});
