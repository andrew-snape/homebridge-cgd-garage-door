interface Config {
  until?: () => Promise<unknown>;
  retries: number;
  isRetry?: boolean;
  onRetry: (error: unknown, retries: number) => void;
  onRecover: (retries: number) => void;
  onFail: (error: unknown) => void;
}

// Gives a struggling/overloaded device a moment to recover instead of
// hammering it with back-to-back retries.
const RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retry = async (fn: () => Promise<unknown>, config: Config) => {
  const { until, retries, onRetry, onRecover, onFail, isRetry } = config;

  try {
    const data = await fn();

    if (until && !await until()) {
      throw new Error('Failed to reach the expected state');
    }

    if (isRetry) {
      onRecover(retries);
    }

    return data;
  } catch (error) {
    if (retries === 0) {
      return onFail(error);
    }

    onRetry(error, retries);
    await sleep(RETRY_DELAY_MS);

    return retry(fn, {
      ...config,
      isRetry: true,
      retries: retries - 1,
    });
  }
};

export default retry;
