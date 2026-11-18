import { useEffect, useState } from 'preact/hooks';

/** A component in its own chunk, fetched the first time it is `wanted`, then kept. */
export const useLazy = <T>(wanted: boolean, load: () => Promise<T>) => {
  const [loaded, setLoaded] = useState<T | null>(null);

  useEffect(() => {
    if (!wanted || loaded) return;

    void load().then((component) => setLoaded(() => component));
  }, [wanted, loaded, load]);

  return loaded;
};
