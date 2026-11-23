import { createApp } from './app';
import { env } from './config/env';
import { closePool, pingMySql } from './db/mysql';
import { connectMongo, disconnectMongo } from './db/mongo';
import { startJobs, stopJobs } from './jobs/scheduler';
import { logger } from './utils/logger';

async function main() {
  if (!(await pingMySql())) {
    logger.error(`Cannot reach MySQL at ${env.DB_HOST}:${env.DB_PORT} (db "${env.DB_NAME}"). Check backend/.env and run "npm run db:migrate".`);
    process.exit(1);
  }
  await connectMongo(); // non-fatal: the API runs without MongoDB, audit events are queued
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`QuadBook API listening on http://localhost:${env.PORT}/api  (${env.NODE_ENV})`);
    startJobs();
  });
  const shutdown = async () => {
    stopJobs(); server.close();
    await disconnectMongo(); await closePool(); process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch((e) => { logger.error('Fatal startup error', e); process.exit(1); });
