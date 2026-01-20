/**
 * Logger utility that respects environment settings.
 * In development: all log levels output to console.
 * In production: only warn and error are logged.
 */

interface Logger {
  log: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const isDev = import.meta.env.DEV;

const noop = () => {};

export const logger: Logger = {
  log: isDev ? console.log.bind(console) : noop,
  debug: isDev ? console.debug.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

/**
 * Wraps a promise with a timeout.
 * Use for IPC calls that could hang indefinitely.
 * @param promise The promise to wrap
 * @param ms Timeout in milliseconds
 * @param operationName Optional name for better error messages
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operationName = 'Operation'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Default timeouts for various operations (in ms)
 */
export const TIMEOUTS = {
  /** Quick operations like checking permissions */
  QUICK: 5_000,
  /** Standard operations like file dialogs */
  STANDARD: 30_000,
  /** Long operations like large directory scans */
  LONG: 120_000,
  /** Very long operations - sync can take hours so no timeout by default */
  SYNC: 0, // 0 means no timeout
} as const;

export default logger;
