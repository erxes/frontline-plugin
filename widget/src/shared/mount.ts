/**
 * Where an embed renders: a shadow root on `host` with the embed's own stylesheet, so the
 * website's styles and the embed's never meet.
 */
export const mount = (host: HTMLElement, css: string) => {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const container = document.createElement('div');

  style.textContent = css;
  root.replaceChildren(style, container);

  return container;
};
