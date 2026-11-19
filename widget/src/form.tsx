// A website's form: `<script type="module" src=".../widget/form.js?key=KEY&code=CODE">`. The
// script's own address names the organisation's key, the form and where frontline's API is. A
// `<div data-frontline-form="CODE">` on the page draws the form in place, whatever its load type,
// as a help center's form page does; without one the form opens as its load type says. Its own
// words show in the script's `&language=`, else the form's language, else English.
import { render } from 'preact';
import { formApi } from './form/api.ts';
import { FormEmbed } from './form/FormEmbed.tsx';
import styles from './form/form.css?inline';
import { mount } from './shared/mount.ts';
import { languageOf, TextProvider, textIn } from './shared/text.ts';

const script = new URL(import.meta.url);
const key = script.searchParams.get('key');
const code = script.searchParams.get('code');

const start = async (organization: string, form: string) => {
  const path = `../api/public/${encodeURIComponent(organization)}/forms/${encodeURIComponent(form)}`;
  const api = formApi(new URL(path, script));
  const found = await api.form();
  const language = languageOf(script.searchParams.get('language'), found.form.languageCode);
  const text = await textIn(language);
  const slot = document.querySelector(`[data-frontline-form="${CSS.escape(form)}"]`);
  const host = document.createElement('div');

  const visitorForm = slot
    ? { ...found, form: { ...found.form, loadType: 'embedded' as const } }
    : found;

  host.className = 'frontline-form';

  if (language) host.lang = language;
  (slot ?? document.body).append(host);
  render(
    <TextProvider value={text}>
      <FormEmbed api={api} code={form} visitorForm={visitorForm} />
    </TextProvider>,
    mount(host, styles),
  );
};

// A form that is gone or archived shows nothing.
if (key && code) void start(key, code).catch(() => null);
