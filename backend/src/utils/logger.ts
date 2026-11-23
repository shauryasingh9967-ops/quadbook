type Level = 'info' | 'warn' | 'error' | 'debug';
const ts = () => new Date().toISOString();
const quiet = process.env.NODE_ENV === 'test';

function write(level: Level, msg: string, meta?: unknown) {
  if (quiet && level !== 'error') return;
  const line = `${ts()} [${level.toUpperCase()}] ${msg}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

export const logger = {
  info: (m: string, meta?: unknown) => write('info', m, meta),
  warn: (m: string, meta?: unknown) => write('warn', m, meta),
  error: (m: string, meta?: unknown) => write('error', m, meta),
  debug: (m: string, meta?: unknown) => write('debug', m, meta),
};
