import { readableColor } from 'color2k';
import { html, raw } from 'hono/html';
import type { VisitorSite } from '../public.ts';
import type { Copy } from './copy.ts';
import { SITE_CSS } from './style.ts';

/** HTML that `html` escaped as it was built; anything interpolated into it was escaped too. */
export type Html = ReturnType<typeof html>;

/** What every page of a help center's site draws from: its data, its words and its address. */
export type Site = VisitorSite & {
  copy: Copy;
  /** Where the site's pages sit: `/help/<key>` on frontline's address, nothing on its own host. */
  base: string;
  /** The help center's header and footer HTML, sanitized as article bodies are. */
  headerHtml: string;
  footerHtml: string;
};

const COLOR = /^[#\w(),.%\s-]{1,40}$/;
const FONT = /^[\w\s,'"-]{1,100}$/;

/** A member's colour or font, or nothing when it could break out of its CSS declaration. */
const safe = (value: string | null | undefined, pattern: RegExp) =>
  value && pattern.test(value) ? value : undefined;

/** The text colour that reads on `background`, or white for a colour color2k can't parse. */
const textOn = (background: string) => {
  try {
    return readableColor(background);
  } catch {
    return '#fff';
  }
};

/** The help center's colours and fonts as the CSS variables `SITE_CSS` reads. */
const themeOf = ({ helpCenter, topic }: Site) => {
  const { styles } = helpCenter;
  const color = (value: string | null | undefined) => safe(value, COLOR);
  const brand = color(styles.helpCenterColor) ?? color(helpCenter.color) ?? color(topic?.color);
  const header = color(styles.headerColor) ?? brand ?? '#1e1b4b';
  const footer = color(styles.footerColor) ?? '#0f172a';
  const button = color(styles.primaryButtonColor) ?? brand ?? '#4f46e5';

  const variables = {
    '--hc-brand': brand ?? '#4f46e5',
    '--hc-header': header,
    '--hc-header-text': textOn(header),
    '--hc-footer': footer,
    '--hc-footer-text': textOn(footer),
    '--hc-button': button,
    '--hc-button-text': textOn(button),
    '--hc-body': color(styles.bodyColor),
    '--hc-subtle': color(styles.backgroundColor),
    '--hc-text': color(styles.baseColor),
    '--hc-heading': color(styles.headingColor),
    '--hc-link': color(styles.linkColor),
    '--hc-link-hover': color(styles.linkHoverColor) ?? color(styles.activeTabColor),
    '--hc-divider': color(styles.dividerColor),
    '--hc-font': safe(styles.baseFont, FONT),
    '--hc-heading-font': safe(styles.headingFont, FONT),
  };

  return Object.entries(variables)
    .flatMap(([name, value]) => (value ? [`${name}:${value}`] : []))
    .join(';');
};

/** An address on the site, under its base. */
export const href = (site: Site, path: string) => `${site.base}${path}` || '/';

/** A link a member typed in the footer: a web or mail address, or a path on the site. */
const outward = (url: string) => /^(https?:|mailto:|tel:|\/(?!\/))/i.test(url);

const Header = (site: Site) => {
  const { helpCenter, copy, forms } = site;
  const name = helpCenter.header.wordmark || helpCenter.title;
  const logo = helpCenter.styles.mainLogo;

  return html`<header class="hc-header">
    <div class="hc-wrap hc-bar">
      <a class="hc-brand" href="${href(site, '/')}">
        ${
          logo
            ? html`<img src="${logo}" alt="" />`
            : html`<span class="hc-mark" aria-hidden="true">${name.slice(0, 1)}</span>`
        }
        <span>${name}</span>
      </a>
      <nav aria-label="${helpCenter.title}">
        <a href="${href(site, '/')}">${helpCenter.header.homeLabel || copy.home}</a>
        ${
          site.topic &&
          html`<a href="${href(site, '/')}#categories">
            ${helpCenter.kbLabel || copy.knowledgeBase}
          </a>`
        }
        ${
          forms.length > 0 &&
          html`<a href="${href(site, '/forms')}">${helpCenter.header.formsLabel || copy.forms}</a>`
        }
      </nav>
    </div>
  </header>`;
};

const Footer = (site: Site) => {
  const { helpCenter } = site;
  const { footer } = helpCenter;
  const year = String(new Date().getFullYear());

  return html`<footer class="hc-footer">
    <div class="hc-wrap hc-footer-grid">
      <div>
        ${footer.logo && html`<img class="hc-footer-logo" src="${footer.logo}" alt="" />`}
        <p>${footer.description || helpCenter.description}</p>
      </div>
      ${(footer.columns ?? []).map(
        (column) =>
          html`<div>
            <h2>${column.heading}</h2>
            <ul>
              ${column.links
                .filter((link) => outward(link.url))
                .map((link) => html`<li><a href="${link.url}">${link.label}</a></li>`)}
            </ul>
          </div>`,
      )}
    </div>
    <p class="hc-wrap hc-copyright">
      ${
        footer.copyright
          ? footer.copyright.replaceAll('{year}', year)
          : `© ${year} ${helpCenter.title}`
      }
    </p>
  </footer>`;
};

/** A whole page of the site: `<head>`, the header, `main`, then the footer. */
export const page = async (site: Site, title: string, main: Html, description?: string | null) => {
  const { helpCenter, copy } = site;
  const heading = title === helpCenter.title ? title : `${title} · ${helpCenter.title}`;
  const favicon = helpCenter.styles.favicon;

  const document = await html`<!doctype html>
    <html lang="${helpCenter.languageCode || 'en'}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${heading}</title>
        <meta name="description" content="${description || helpCenter.description || ''}" />
        ${favicon && html`<link rel="icon" href="${favicon}" />`}
        <style>
          ${raw(SITE_CSS)}
        </style>
      </head>
      <body style="${themeOf(site)}">
        <a class="hc-skip" href="#main">${copy.skip}</a>
        ${raw(site.headerHtml)} ${Header(site)}
        <main id="main">${main}</main>
        ${Footer(site)} ${raw(site.footerHtml)}
      </body>
    </html>`;

  return String(document);
};
