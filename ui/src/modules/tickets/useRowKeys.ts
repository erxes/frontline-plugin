import { type RecordList, usePreviousHotkeyScope, useScopedHotkeys } from 'erxes-ui';
import { useEffect } from 'react';

/** The list's keys work while it is shown, the bulk bar too, until a dialog takes over. */
const TICKETS_SCOPE = 'frontline-tickets';

const useTicketsScope = () => {
  const { setHotkeyScopeAndMemorizePreviousScope, goBackToPreviousHotkeyScope } =
    usePreviousHotkeyScope();

  useEffect(() => {
    setHotkeyScopeAndMemorizePreviousScope(TICKETS_SCOPE);

    return goBackToPreviousHotkeyScope;
  }, [setHotkeyScopeAndMemorizePreviousScope, goBackToPreviousHotkeyScope]);
};

/** Each row's name, in the order shown. */
const rowNames = () => [...document.querySelectorAll<HTMLElement>('[data-ticket-row]')];

/** The row that holds focus, by its name, from any of its controls. */
const focusedRow = () =>
  document.activeElement?.closest('[data-record-row]')?.querySelector('[data-ticket-row]');

/** Focus moves `step` rows from the focused one, or to the first. */
const moveFocus = (step: number) => {
  const all = rowNames();
  const at = all.findIndex((name) => name === focusedRow());
  const next = all[at === -1 ? 0 : Math.min(Math.max(at + step, 0), all.length - 1)];

  next?.focus();
  next?.scrollIntoView({ block: 'nearest' });
};

/**
 * The list's keys, as Operation's task list and Linear: `j`/`k` the next and previous row, `x`
 * picks the focused one, Escape clears the picks.
 */
export const useRowKeys = ({ toggle, clear }: ReturnType<typeof RecordList.useSelection>) => {
  useTicketsScope();
  useScopedHotkeys('j', () => moveFocus(1), TICKETS_SCOPE);
  useScopedHotkeys('k', () => moveFocus(-1), TICKETS_SCOPE);
  useScopedHotkeys('escape', clear, TICKETS_SCOPE, [clear], { preventDefault: false });

  useScopedHotkeys(
    'x',
    () => {
      const name = focusedRow();
      const id = name instanceof HTMLElement ? name.dataset.ticketRow : undefined;

      if (id) toggle(id);
    },
    TICKETS_SCOPE,
    [toggle],
  );
};
