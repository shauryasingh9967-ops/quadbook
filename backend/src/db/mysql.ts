import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { mysqlSslOptions } from './ssl';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 20,
      // Hosted MySQL services (Railway, Aiven, Clever Cloud) usually require TLS.
      // DB_SSL=true enables it; the bundled Aiven CA (backend/certs/aiven-ca.pem)
      // is used to verify the server certificate when present.
      ssl: mysqlSslOptions(),
      dateStrings: true,       // DATETIME stays a plain string -> no timezone surprises
      decimalNumbers: true,    // DECIMAL / ROUND() come back as numbers
      charset: 'utf8mb4',
    });
    // READ COMMITTED: every statement sees the latest committed rows, which is what the
    // resource-row-lock + overlap-check protocol in the booking procedures relies on.
    pool.pool.on('connection', (c) => {
      c.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    });
  }
  return pool;
}

export async function query<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

export async function queryOne<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await getPool().query(sql, params);
  return res as ResultSetHeader;
}

/** Runs fn inside a transaction on one dedicated connection (COMMIT on success, ROLLBACK on error). */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

/** Dedicated connection for stored procedures that manage their own transaction. Retries deadlocks. */
export async function withConnection<T>(fn: (conn: PoolConnection) => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const conn = await getPool().getConnection();
    try {
      return await fn(conn);
    } catch (err) {
      const e = err as { errno?: number };
      if ((e.errno === 1213 || e.errno === 1205) && attempt < retries) {
        logger.warn(`MySQL deadlock/lock-timeout, retry ${attempt}`);
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

export async function pingMySql(): Promise<boolean> {
  try { await getPool().query('SELECT 1'); return true; } catch { return false; }
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}
