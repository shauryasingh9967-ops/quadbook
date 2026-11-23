import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { splitSql } from './sqlSplit';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

export async function migrate(opts: { fresh?: boolean; quiet?: boolean } = {}) {
  const log = (m: string) => { if (!opts.quiet) console.log(m); };
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, charset: 'utf8mb4',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  try {
    if (opts.fresh) {
      log(`Dropping database ${env.DB_NAME} ...`);
      await conn.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``);
    }
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE \`${env.DB_NAME}\``);
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set((done as { name: string }[]).map((r) => r.name));

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const f of files) {
      if (applied.has(f)) { log(`  skip   ${f} (already applied)`); continue; }
      const statements = splitSql(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      for (const s of statements) {
        try { await conn.query(s); }
        catch (e) {
          console.error(`\nMigration ${f} failed on statement:\n${s.slice(0, 300)}...\n`);
          throw e;
        }
      }
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
      log(`  apply  ${f} (${statements.length} statements)`);
      count++;
    }
    log(count ? `Migrations complete (${count} applied).` : 'Database already up to date.');
    return count;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  migrate({ fresh: process.argv.includes('--fresh') }).catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
