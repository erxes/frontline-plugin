// A website's messenger: `<script type="module" src=".../widget/messenger.js?key=KEY">`. The
// script's own address names the messenger and where frontline's API is; a module runs once per
// address, so a page that adds the script again keeps the one messenger.
import { render } from 'preact';
import { messengerApi } from './messenger/api.ts';
import { Messenger } from './messenger/Messenger.tsx';
import styles from './messenger/messenger.css?inline';
import { mount } from './shared/mount.ts';

const script = new URL(import.meta.url);
const key = script.searchParams.get('key');

if (key) {
  const host = document.createElement('div');

  host.id = 'frontline-messenger';
  document.body.append(host);
  render(
    <Messenger api={messengerApi(new URL('../api/public/messenger/', script), key)} />,
    mount(host, styles),
  );
}
