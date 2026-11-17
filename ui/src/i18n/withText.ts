/**
 * A loader that brings the Mongolian text with what it loads. `./config` and the page module
 * use it, so the text loads with the first slot or page shown, not with `./config`.
 */
export const withText =
  <T>(load: () => Promise<T>) =>
  async (): Promise<T> => {
    const [loaded, text] = await Promise.all([load(), import('./i18n.ts')]);

    text.registerTranslations();

    return loaded;
  };
