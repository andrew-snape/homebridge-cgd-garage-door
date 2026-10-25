interface Config {
  retries: number;
  isRetry?: boolean;
  // Gap between attempts; defaults to RETRY_DELAY_MS.
  delayMs?: number;
  onRetry: (error: unknown, retries: number) => void;
  onRecover: (retries: number) => void;
  onFail: (error: unknown) => void;
}

// Gives a struggling/overloaded device a moment to recover instead of
// hammering it with back-to-back retries.
export const RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries `fn` (a single send / fetch) on failure only. Whether the device
// then reaches some expected state is deliberately *not* this function's
// concern: re-sending a command because the door is merely slow to react
// would repeat it (e.g. door=open up to 4 times).
const retry = async (fn: () => Promise<unknown>, config: Config): Promise<unknown> => {
  const { retries, onRetry, onRecover, onFail, isRetry, delayMs = RETRY_DELAY_MS } = config;

  try {
    const data = await fn();

    if (isRetry) {
      onRecover(retries);
    }

    return data;
  } catch (error) {
    if (retries === 0) {
      return onFail(error);
    }

    onRetry(error, retries);
    await sleep(delayMs);

    return retry(fn, {
      ...config,
      isRetry: true,
      retries: retries - 1,
    });
  }
};

export default retry;
