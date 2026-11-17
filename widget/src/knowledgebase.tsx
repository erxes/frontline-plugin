// A website's knowledge base: `<script type="module" src=".../widget/knowledgebase.js?key=KEY">`,
// KEY being the help center's public key. The script's own address names the help center and
// where frontline's API is.
import { render } from 'preact';
import { knowledgeBaseApi } from './knowledgebase/api.ts';
import { KnowledgeBase } from './knowledgebase/KnowledgeBase.tsx';
import styles from './knowledgebase/knowledgebase.css?inline';
import { mount } from './shared/mount.ts';

const script = new URL(import.meta.url);
const key = script.searchParams.get('key');

const start = async (center: string) => {
  const api = knowledgeBaseApi(
    new URL(`../api/public/help-centers/${encodeURIComponent(center)}`, script),
  );

  const site = await api.site();
  const host = document.createElement('div');

  host.id = 'frontline-knowledgebase';
  document.body.append(host);
  render(<KnowledgeBase site={site} read={api.read} />, mount(host, styles));
};

// A help center that is gone shows nothing.
if (key) void start(key).catch(() => null);
