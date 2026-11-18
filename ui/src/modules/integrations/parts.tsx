import { IconPlus, IconX } from '@tabler/icons-react';
import { Badge, Button, Input, textOf } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

// What the integrations page and the account and bot panels share.

/** Whether the provider last answered for the account or bot. */
export const StatusBadge = ({ status }: { status: 'healthy' | 'broken' }) => {
  const { t } = useTranslation('frontline');

  return (
    <Badge variant={status === 'healthy' ? 'success' : 'destructive'}>
      {status === 'healthy' ? t('working', 'Working') : t('broken', 'Broken')}
    </Badge>
  );
};

/** One row of a panel's list: its text, and a button that takes it out. */
export const ItemRow = ({
  label,
  hint,
  onRemove,
}: {
  label: string;
  hint?: string;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <li className="flex items-center gap-2 px-2 py-1 text-xs">
      <span className="flex-1 truncate">
        {label}
        {hint && <span className="ml-2 text-muted-foreground">{hint}</span>}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('remove-item', 'Remove {{name}}', { name: label })}
        onClick={onRemove}
      >
        <IconX />
      </Button>
    </li>
  );
};

/** A row's inputs and its Add button, cleared once the item is added. */
export const AddRow = ({
  fields,
  onAdd,
}: {
  fields: { name: string; label: string; maxLength?: number; required?: boolean; type?: string }[];
  onAdd: (values: Record<string, string>) => void;
}) => {
  const { t } = useTranslation('frontline');

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    onAdd(Object.fromEntries(fields.map(({ name }) => [name, textOf(form.get(name)).trim()])));
    event.currentTarget.reset();
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-2 py-1">
      {fields.map((field) => (
        <Input
          key={field.name}
          name={field.name}
          type={field.type}
          required={field.required}
          maxLength={field.maxLength}
          aria-label={field.label}
          placeholder={field.label}
          variant="bordered"
          text="sm"
        />
      ))}
      <Button type="submit" variant="secondary">
        <IconPlus />
        {t('add', 'Add')}
      </Button>
    </form>
  );
};
