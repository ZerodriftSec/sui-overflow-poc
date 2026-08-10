type BackgroundPersistOperation<T> = () => Promise<T>;

interface QueueJob<T> {
  operation: BackgroundPersistOperation<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const queue: QueueJob<unknown>[] = [];
let running = false;

async function drainQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) continue;
      try {
        const result = await next.operation();
        next.resolve(result);
      } catch (error) {
        next.reject(error);
      }
    }
  } finally {
    running = false;
  }
}

export function enqueueBackgroundPersist<T>(
  operation: BackgroundPersistOperation<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      operation,
      resolve: (value) => resolve(value as T),
      reject,
    });
    void drainQueue();
  });
}

