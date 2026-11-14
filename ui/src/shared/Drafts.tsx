import { Button, useConfirm } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Unsaved form values per record, kept while the page is open, so closing a
 * panel loses nothing: reopening the record brings its draft back.
 */
export const draftsOf = <T extends object>() => {
  const drafts = new Map<string, T>();

  const useDraft = (key: string, saved: T) => {
    const [value, setValue] = useState(() => drafts.get(key) ?? saved);

    return {
      value,
      dirty: drafts.has(key),
      change: (patch: Partial<T>) => {
        const next = { ...(drafts.get(key) ?? saved), ...patch };

        drafts.set(key, next);
        setValue(next);
      },
      clear: () => {
        drafts.delete(key);
        setValue(saved);
      },
    };
  };

  return useDraft;
};

/** A draft form's buttons: discard the changes once the member agrees, and submit. */
export const FormActions = ({
  dirty,
  onDiscard,
  disabled,
  submit,
}: {
  dirty: boolean;
  onDiscard: () => void;
  /** While saving, or while the form can't be sent. */
  disabled: boolean;
  submit: string;
}) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();

  const discard = async () => {
    await confirm({ message: t('discard-changes', 'Discard your unsaved changes?') });
    onDiscard();
  };

  return (
    <div className="flex justify-end gap-2">
      {dirty && (
        <Button type="button" variant="ghost" onClick={() => void discard()}>
          {t('discard', 'Discard')}
        </Button>
      )}
      <Button type="submit" disabled={disabled}>
        {submit}
      </Button>
    </div>
  );
};
