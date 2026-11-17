// A website's form: `<script type="module" src=".../widget/form.js?key=KEY&code=CODE">`. The
// script's own address names the organisation's key, the form and where frontline's API is. An
// embedded form renders into `<div data-frontline-form="CODE">`, or at the end of the page.
import { render } from 'preact';
import { formApi } from './form/api.ts';
import { FormEmbed } from './form/FormEmbed.tsx';
import styles from './form/form.css?inline';
import { mount } from './shared/mount.ts';

const script = new URL(import.meta.url);
const key = script.searchParams.get('key');
const code = script.searchParams.get('code');

const start = async (organization: string, form: string) => {
  const path = `../api/public/${encodeURIComponent(organization)}/forms/${encodeURIComponent(form)}`;
  const api = formApi(new URL(path, script));
  const visitorForm = await api.form();
  const slot = document.querySelector(`[data-frontline-form="${CSS.escape(form)}"]`);
  const host = document.createElement('div');

  host.className = 'frontline-form';
  (slot ?? document.body).append(host);
  render(<FormEmbed api={api} code={form} visitorForm={visitorForm} />, mount(host, styles));
};

// A form that is gone or archived shows nothing.
if (key && code) void start(key, code).catch(() => null);
