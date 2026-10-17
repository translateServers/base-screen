type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const VERBOSE = import.meta.env.DEV;

function write(scope: string, level: LogLevel, args: readonly unknown[]): void {
  if (level === 'debug' && !VERBOSE) return;
  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${scope}]`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
}

export interface Logger {
  debug(...args: readonly unknown[]): void;
  info(...args: readonly unknown[]): void;
  warn(...args: readonly unknown[]): void;
  error(...args: readonly unknown[]): void;
}

/** 轻量前端日志：debug 仅开发模式下输出；不记录任何凭证或完整文档内容。 */
export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => write(scope, 'debug', args),
    info: (...args) => write(scope, 'info', args),
    warn: (...args) => write(scope, 'warn', args),
    error: (...args) => write(scope, 'error', args),
  };
}
