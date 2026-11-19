// A website's knowledge base: `<script type="module" src=".../widget/knowledgebase.js?key=KEY">`,
// KEY being the help center's public key. The script's own address names the help center and
// where frontline's API is. It shows in the script's `language`, else the help center's, else
// its topic's, as the old widget did.
import { render } from 'preact';
import { knowledgeBaseApi } from './knowledgebase/api.ts';
import { KnowledgeBase } from './knowledgebase/KnowledgeBase.tsx';
import styles from './knowledgebase/knowledgebase.css?inline';
import { mount } from './shared/mount.ts';
import { languageOf, TextProvider, textIn } from './shared/text.ts';

const script = new URL(import.meta.url);
const key = script.searchParams.get('key');

const start = async (center: string) => {
  const api = knowledgeBaseApi(
    new URL(`../api/public/help-centers/${encodeURIComponent(center)}`, script),
  );

  const site = await api.site();

  const language = languageOf(
    script.searchParams.get('language'),
    site.helpCenter.languageCode,
    site.topic?.languageCode,
  );

  const text = await textIn(language);
  const host = document.createElement('div');

  host.id = 'frontline-knowledgebase';

  // Without a language of its own, the embed reads in the page's.
  if (language) host.lang = language;
  document.body.append(host);
  render(
    <TextProvider value={text}>
      <KnowledgeBase site={site} read={api.read} list={api.list} search={api.search} />
    </TextProvider>,
    mount(host, styles),
  );
};

// A help center that is gone shows nothing.
if (key) void start(key).catch(() => null);
