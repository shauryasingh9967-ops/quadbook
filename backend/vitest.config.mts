import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'smart_campus_test',
      MONGO_URI: process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/smart_campus_test_logs',
      BCRYPT_ROUNDS: '4',
      AUTH_RATE_LIMIT_MAX: '10000',
    },
  },
});
