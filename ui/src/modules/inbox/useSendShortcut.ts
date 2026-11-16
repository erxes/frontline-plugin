import { useHotkeys } from 'react-hotkeys-hook';

/**
 * Ctrl or ⌘ with Enter runs `send`, and Escape `cancel`, while the focus is inside the element
 * given the returned ref: the editor takes every other key. The keys listen on that element
 * alone, so they skip erxes-ui's app-wide hotkey scope, which core's web never turns on
 * (https://github.com/erxes/erxes/issues/10612).
 */
export const useSendShortcut = ({ send, cancel }: { send: () => void; cancel?: () => void }) =>
  useHotkeys<HTMLFormElement>(
    cancel ? ['mod+enter', 'escape'] : 'mod+enter',
    (_event, { keys }) => (keys?.includes('enter') ? send() : cancel?.()),
    { enableOnContentEditable: true, enableOnFormTags: true, preventDefault: true },
    [send, cancel],
  );
