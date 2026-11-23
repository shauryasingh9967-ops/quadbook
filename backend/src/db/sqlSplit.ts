/** Splits a MySQL script into statements. Understands `DELIMITER xx` lines (needed for routines/triggers). */
export function splitSql(script: string): string[] {
  const out: string[] = [];
  let delim = ';';
  let buf = '';
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (/^DELIMITER\s+/i.test(t)) { delim = t.split(/\s+/)[1]; continue; }
    if (t.startsWith('--') || t === '') { if (buf) buf += '\n'; continue; }
    buf += (buf ? '\n' : '') + line;
    if (t.endsWith(delim)) {
      const stmt = buf.slice(0, buf.lastIndexOf(delim)).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
