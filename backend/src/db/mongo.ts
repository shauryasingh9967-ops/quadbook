import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const mongoState = {
  connected: false,
  lastError: null as string | null,
  writes: 0,
  queued: 0,
  dropped: 0,
};

type Job = () => Promise<unknown>;
const queue: Job[] = [];
const MAX_QUEUE = 1000;
let retryTimer: NodeJS.Timeout | null = null;
let stopped = false;

mongoose.set('bufferCommands', false); // fail fast instead of hanging when MongoDB is down

async function flushQueue() {
  while (queue.length && mongoState.connected) {
    const job = queue.shift()!;
    try { await job(); mongoState.writes++; } catch { queue.unshift(job); break; }
  }
  mongoState.queued = queue.length;
}

mongoose.connection.on('connected', () => {
  mongoState.connected = true; mongoState.lastError = null;
  logger.info('MongoDB connected (secondary database: audit logs, activity, notification history)');
  void flushQueue();
});
mongoose.connection.on('disconnected', () => {
  if (mongoState.connected) logger.warn('MongoDB disconnected - events will be queued in memory');
  mongoState.connected = false;
});

export async function connectMongo(): Promise<boolean> {
  stopped = false;
  try {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 2500 });
    return true;
  } catch (e) {
    mongoState.connected = false;
    mongoState.lastError = (e as Error).message.split('\n')[0];
    logger.warn(`MongoDB unavailable (${mongoState.lastError}). API keeps running; audit events are queued and retried.`);
    if (!stopped && !env.isTest) {
      retryTimer = setTimeout(() => { void connectMongo(); }, 10_000);
      retryTimer.unref();
    }
    return false;
  }
}

export async function disconnectMongo() {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  await mongoose.disconnect().catch(() => undefined);
  mongoState.connected = false;
}

/** Fire-and-forget write. Never throws; if MongoDB is down the job is queued (bounded) and retried on reconnect. */
export function safeWrite(job: Job): void {
  const run = async () => {
    if (!mongoState.connected) throw new Error('mongo offline');
    await job();
    mongoState.writes++;
  };
  run().catch(() => {
    if (queue.length >= MAX_QUEUE) { queue.shift(); mongoState.dropped++; }
    queue.push(job);
    mongoState.queued = queue.length;
  });
}

export async function flushPending() { await flushQueue(); }
