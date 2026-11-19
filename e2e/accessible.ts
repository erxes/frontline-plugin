import { AxeBuilder } from '@axe-core/playwright';
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test';

/** Each browser context's requests still in flight, but live streams, which never end. */
const inFlight = new WeakMap<BrowserContext, Set<Request>>();

/** Starts counting `context`'s requests for `expectAccessible`. */
export const trackRequests = (context: BrowserContext) => {
  const requests = new Set<Request>();

  inFlight.set(context, requests);
  context.on('request', (request) => {
    if (request.resourceType() !== 'eventsource') requests.add(request);
  });
  context.on('requestfinished', (request) => requests.delete(request));
  context.on('requestfailed', (request) => requests.delete(request));
};

/**
 * Runs axe on the page held still: CSS transitions and animations are off, and the finite script
 * animations left, such as auto-animate's fades, have ended. A colour mid-transition reads as low
 * contrast, so each is measured at its end. The rule goes into the document and every open shadow
 * root, where the messenger widget draws, and comes out afterwards.
 */
const scan = async (page: Page) => {
  const still = await page.evaluateHandle(() => {
    const sheet = new CSSStyleSheet();

    const rootsOf = (root: Document | ShadowRoot): (Document | ShadowRoot)[] => [
      root,
      ...[...root.querySelectorAll('*')].flatMap((element) =>
        element.shadowRoot ? rootsOf(element.shadowRoot) : [],
      ),
    ];

    const roots = rootsOf(document);

    sheet.replaceSync(
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
    );

    for (const root of roots) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

    return { sheet, roots };
  });

  try {
    await page.waitForFunction(
      ({ roots }) =>
        roots
          .flatMap((root) => root.getAnimations())
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getTiming().iterations === Infinity,
          ),
      still,
    );

    return await new AxeBuilder({ page }).analyze();
  } finally {
    await still.evaluate(({ sheet, roots }) => {
      for (const root of roots)
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((adopted) => adopted !== sheet);
    });
  }
};

/**
 * Fails on serious or critical axe violations, listing each rule with the elements that break it.
 * Colours are checked at rest: once `shown`, which the page draws from its data, is visible, every
 * request has answered and drawn, and the page holds still. Data that lands mid-scan changes what
 * axe measures: the list's record count fades in under its leaving skeleton (erxes/erxes#10812).
 */
export const expectAccessible = async (page: Page, shown: Locator) => {
  await expect(shown).toBeVisible();
  await expect
    .poll(() => [...(inFlight.get(page.context()) ?? [])].map((request) => request.url()), {
      message: 'requests still in flight',
      timeout: 15_000,
    })
    .toEqual([]);
  // The last answer renders on a later frame.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

  const { violations } = await scan(page);

  const blocking = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(' ')}\n    ${node.html.slice(0, 200)}`)
          .join('\n')}`,
    );

  expect(blocking, `axe on ${page.url()}`).toEqual([]);
};
