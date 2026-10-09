let tail: Promise<void> = Promise.resolve()

export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn)
  tail = run.then(() => undefined, () => undefined)
  return run
}
