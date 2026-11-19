import { IconCopy } from '@tabler/icons-react';
import { Button } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useCopy } from './hooks.ts';

/** The line that loads an embed's script from `scriptUrl`. */
export const scriptTag = (scriptUrl: string) =>
  `<script type="module" src="${scriptUrl}"></script>`;

/** Code a website pastes to show an embed, left-aligned as it is pasted, with a copy button. */
export const InstallCode = ({ code, label }: { code: string; label: string }) => {
  const { t } = useTranslation('frontline');
  const copy = useCopy();

  return (
    <div className="relative">
      <code
        aria-label={label}
        className="block rounded-md bg-muted p-3 pr-10 font-mono text-xs wrap-break-word whitespace-pre-wrap"
      >
        {code}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5"
        aria-label={t('copy', 'Copy')}
        onClick={() => void copy(code)}
      >
        <IconCopy />
      </Button>
    </div>
  );
};
