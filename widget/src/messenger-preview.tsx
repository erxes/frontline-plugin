// The messenger settings page's preview: the messenger's own launcher and panel in a frame of
// their own, drawn from the settings the page posts. Websites never load it.
import { render } from 'preact';
import styles from './messenger/messenger.css?inline';
import { Preview } from './messenger/preview/Preview.tsx';
import { mount } from './shared/mount.ts';

const host = document.createElement('div');

document.body.append(host);

render(<Preview />, mount(host, styles));
