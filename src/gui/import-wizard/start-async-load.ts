export type IsLive = () => boolean;

export function startAsyncLoad(
  load: (isLive: IsLive) => Promise<void>,
): () => void {
  const state = { isCancelled: false };
  void (async () => {
    await load(() => !state.isCancelled);
  })();
  return () => {
    state.isCancelled = true;
  };
}
