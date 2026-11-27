import { type RecordList, usePageHotkey } from 'erxes-ui';

/** Each row's name, in the order shown. */
const rowNames = () => [...document.querySelectorAll<HTMLElement>('[data-ticket-row]')];

/** Focus moves `step` rows from the focused one, or to the first. */
const moveFocus = (step: number) => {
  const all = rowNames();
  const at = all.findIndex((name) => name === document.activeElement);
  const next = all[at === -1 ? 0 : Math.min(Math.max(at + step, 0), all.length - 1)];

  next?.focus();
  next?.scrollIntoView({ block: 'nearest' });
};

/**
 * The list's keys, as Operation's task list and Linear: `j`/`k` the next and previous row, `x`
 * picks the focused one, Escape clears the picks.
 */
export const useRowKeys = (selection: ReturnType<typeof RecordList.useSelection>) => {
  usePageHotkey('j', () => moveFocus(1));
  usePageHotkey('k', () => moveFocus(-1));
  usePageHotkey('escape', selection.clear, { when: () => selection.ids.length > 0 });
  usePageHotkey('x', () => {
    const id = document.activeElement?.closest<HTMLElement>('[data-ticket-row]')?.dataset.ticketRow;

    if (id) selection.toggle(id);
  });
};
