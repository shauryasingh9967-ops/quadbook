// Shared MySQL TLS options.
// When DB_SSL=true, verify the server certificate against the bundled CA
// (backend/certs/aiven-ca.pem — the public Aiven project CA for this deployment).
// If the CA file is absent (e.g. a different SSL host), fall back to the
// platform trust store instead of disabling verification.
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

export function mysqlSslOptions(): { ca: string; rejectUnauthorized: true } | { rejectUnauthorized: true } | undefined {
  if (env.DB_SSL !== 'true') return undefined;
  const caPath = path.resolve(__dirname, '../../certs/aiven-ca.pem');
  try {
    const ca = fs.readFileSync(caPath, 'utf8');
    return { ca, rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}
