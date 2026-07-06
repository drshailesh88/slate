// Structured logger with request IDs for production tracing

let requestCounter = 0;

function generateRequestId(): string {
  requestCounter = (requestCounter + 1) % 1_000_000;
  return `${Date.now()}-${requestCounter.toString(36)}`;
}

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
  const { level, message, ...rest } = entry;
  const timestamp = new Date().toISOString();
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `${timestamp} [${level.toUpperCase()}] ${message}${extra}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = { level: "info", message, ...meta };
    console.log(formatLog(entry));
  },

  warn(message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = { level: "warn", message, ...meta };
    console.warn(formatLog(entry));
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errorDetails: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errorDetails.errorMessage = error.message;
      errorDetails.stack = error.stack;
    } else if (error !== undefined) {
      errorDetails.errorMessage = String(error);
    }
    const entry: LogEntry = { level: "error", message, ...errorDetails };
    console.error(formatLog(entry));
  },

  /** Create a child logger with a request ID pre-set */
  withRequestId(requestId?: string) {
    const id = requestId ?? generateRequestId();
    return {
      id,
      info: (message: string, meta?: Record<string, unknown>) =>
        logger.info(message, { requestId: id, ...meta }),
      warn: (message: string, meta?: Record<string, unknown>) =>
        logger.warn(message, { requestId: id, ...meta }),
      error: (message: string, error?: unknown, meta?: Record<string, unknown>) =>
        logger.error(message, error, { requestId: id, ...meta }),
    };
  },
};
