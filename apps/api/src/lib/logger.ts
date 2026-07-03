// Minimal structured-ish console logger shared across the API — no external
// logging library, since Railway just captures stdout.
type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, payload?: unknown): void {
  const base = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (payload === undefined) {
    console.log(base);
    return;
  }
  // Note: error-level logs still go through console.log rather than
  // console.error, so all levels interleave in one stdout stream in order.
  console.log(base, payload);
}

export const logger = {
  info: (message: string, payload?: unknown) => emit("info", message, payload),
  warn: (message: string, payload?: unknown) => emit("warn", message, payload),
  error: (message: string, payload?: unknown) =>
    emit("error", message, payload),
};
