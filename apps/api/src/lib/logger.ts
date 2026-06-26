type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, payload?: unknown): void {
  const base = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (payload === undefined) {
    console.log(base);
    return;
  }
  console.log(base, payload);
}

export const logger = {
  info: (message: string, payload?: unknown) => emit("info", message, payload),
  warn: (message: string, payload?: unknown) => emit("warn", message, payload),
  error: (message: string, payload?: unknown) =>
    emit("error", message, payload),
};
