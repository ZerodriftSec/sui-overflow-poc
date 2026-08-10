import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
const prefix = process.env.BULLMQ_PREFIX || 'bull';

if (!redisUrl) {
  console.error('Missing REDIS_URL. Add it to your environment before running this command.');
  process.exit(1);
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

async function main() {
  const match = `${prefix}:*`;
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 1000);
    cursor = nextCursor;

    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keys) pipeline.unlink(key);
      const results = await pipeline.exec();
      for (const result of results ?? []) {
        if (result && result[0] == null && typeof result[1] === 'number') {
          deleted += result[1];
        }
      }
    }
  } while (cursor !== '0');

  console.log(`Cleared BullMQ keys with prefix "${prefix}". Deleted keys: ${deleted}`);
}

main()
  .catch((err) => {
    console.error('Failed to clear BullMQ keys:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit();
  });
