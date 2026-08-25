// Serializes access to a shared resource (the CGD device's single-connection
// HTTP server) across independent callers — e.g. status polling and camera
// snapshots — so they don't race each other and both fail.
export default class Mutex {
  private queue: Promise<unknown> = Promise.resolve();

  runExclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  };
}
