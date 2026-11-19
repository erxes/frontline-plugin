import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { MN } from '../languages/mn.ts';

/**
 * A string the embeds show, written in English; `languages/mn.ts` has each one in Mongolian, in a
 * chunk of its own that only a Mongolian embed loads.
 */
export type English = keyof typeof MN;

type Words = Partial<Record<English, string>>;

const known = (words: Words, text: string): text is English => Object.hasOwn(words, text);

/** The text of one embed, in the language whose `words` it has; English has none. */
const textOf = (words: Words) => {
  /** `english` in the embed's language, each `{name}` in it filled from `values`. */
  const t = (english: English, values: Record<string, string | number> = {}) =>
    (words[english] ?? english).replaceAll(/\{(\w+)\}/g, (_, name: string) =>
      String(values[name] ?? ''),
    );

  /**
   * What went wrong, as the API said it, in the embed's language when its words have it. A
   * failure that never reached the API, such as a lost connection, reads as a generic one.
   */
  const messageOf = (failure: unknown) => {
    if (!(failure instanceof Error) || failure instanceof TypeError)
      return t('Something went wrong');

    return known(words, failure.message) ? t(failure.message) : failure.message;
  };

  return { t, messageOf };
};

export type Text = ReturnType<typeof textOf>;

const ENGLISH = textOf({});

// Each embed provides its own text: the embeds on a page share this module, so a module-level
// language would let one embed's language change another's.
const Context = createContext(ENGLISH);

export const TextProvider = Context.Provider;

/** The text of the embed this component is in. */
export const useText = () => useContext(Context);

/**
 * The first language `values` names, as its two-letter code: the website's `language` on the
 * script's address, then the messenger's, help center's or topic's own, as the old widget's
 * `setLocale` picked it. Anything that isn't a language tag counts as none.
 */
export const languageOf = (...values: (string | null | undefined)[]) =>
  values.map((value) => /^[a-z]{2}(?![a-z])/i.exec(value ?? '')?.[0].toLowerCase()).find(Boolean);

/**
 * The text in `language`: Mongolian loads its words; anything else shows English, as does
 * Mongolian when its chunk fails to load, so the embed still draws.
 */
export const textIn = async (language: string | undefined) =>
  language === 'mn'
    ? import('../languages/mn.ts').then(
        ({ MN }) => textOf(MN),
        () => ENGLISH,
      )
    : ENGLISH;

/** `textIn` for a component: null until the text of `language` loads. */
export const useTextIn = (language: string | undefined) => {
  const [loaded, setLoaded] = useState<{ language: string | undefined; text: Text } | null>(null);

  useEffect(() => {
    let live = true;

    void textIn(language).then((text) => live && setLoaded({ language, text }));

    return () => {
      live = false;
    };
  }, [language]);

  return loaded && loaded.language === language ? loaded.text : null;
};
