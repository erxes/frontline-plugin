import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Waits until the page holds still for `quietMs`: no finite animation runs, such as core's side
 * panel sliding in or a sheet's overlay fading, no skeleton pulses, and nothing in the DOM changes.
 * The page behind a side panel can still be loading once the panel's fields show, and its rows
 * would land while axe reads colours. Spinners loop forever, so only skeletons count as loading.
 */
const settle = (page: Page) =>
  page.evaluate(async (quietMs) => {
    let changed = performance.now();

    const observer = new MutationObserver(() => {
      changed = performance.now();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    await new Promise<void>((done) => {
      const frame = () => {
        const moving = document
          .getAnimations()
          .some(
            (animation) =>
              animation.playState === 'running' &&
              (animation.effect?.getTiming().iterations !== Infinity ||
                (animation instanceof CSSAnimation && animation.animationName === 'pulse')),
          );

        if (moving) changed = performance.now();

        if (performance.now() - changed >= quietMs) done();
        else requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    });
    observer.disconnect();
  }, 250);

/**
 * Fails on serious or critical axe violations, listing each rule with the elements that break it.
 * Colours are checked at rest: once `shown`, which the page draws from its data, is visible and
 * the page settles.
 */
export const expectAccessible = async (page: Page, shown: Locator) => {
  await expect(shown).toBeVisible();
  await settle(page);

  const { violations } = await new AxeBuilder({ page }).analyze();

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
