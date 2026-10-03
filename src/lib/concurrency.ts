/**
 * Runs `fn` over `items` with at most `limit` promises in flight. After the
 * first rejection no further items are started; it rejects with that error
 * once the calls already in flight have settled.
 */
export async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  let failed = false;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && index < items.length) {
      const item = items[index++];
      try {
        await fn(item);
      } catch (err) {
        if (!failed) firstError = err;
        failed = true;
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw firstError;
}
