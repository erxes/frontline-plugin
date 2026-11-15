import { Button, Sheet, Spinner } from 'erxes-ui';
import type { ReactNode, SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A settings entry added in a side sheet, as core's settings add a tag: a title, the fields, and
 * Cancel and Create at the bottom. The API's refusal shows above them.
 */
export const FormSheet = ({
  open,
  onOpenChange,
  title,
  onSubmit,
  submitting,
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (form: FormData) => void;
  submitting: boolean;
  error: Error | null;
  children: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.View size="lg">
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
          <Sheet.Header>
            <Sheet.Title>{title}</Sheet.Title>
            <Sheet.Description className="sr-only">{title}</Sheet.Description>
            <Sheet.Close />
          </Sheet.Header>
          <Sheet.Content className="min-h-0 overflow-y-auto">
            <div className="flex flex-col gap-4">{children}</div>
          </Sheet.Content>
          <Sheet.Footer className="flex items-center justify-end">
            {error && (
              <p role="alert" className="mr-auto text-xs text-destructive-text">
                {error.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner size="sm" />}
              {t('create', 'Create')}
            </Button>
          </Sheet.Footer>
        </form>
      </Sheet.View>
    </Sheet>
  );
};
