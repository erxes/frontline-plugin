import {
  IconArchive,
  IconCopy,
  IconLayoutList,
  IconRestore,
  IconSettings,
  IconTable,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Badge, buttonVariants, toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import type { RowAction } from '~/shared/Records.tsx';
import {
  type Form,
  type FormStatus,
  formPath,
  useDeleteForms,
  useFormChange,
  useStatusNames,
} from './useForms.ts';

const badges = { active: 'success', archived: 'muted' } as const satisfies Record<
  FormStatus,
  string
>;

/** The status as a badge. */
export const StatusBadge = ({ status }: { status: FormStatus }) => (
  <Badge variant={badges[status]}>{useStatusNames()[status]}</Badge>
);

/** The name opens the form's own page. */
export const FormName = ({ form }: { form: Pick<Form, 'id' | 'name'> }) => (
  <Link
    to={formPath(form.id)}
    className={buttonVariants({ variant: 'ghost', className: 'min-w-0 justify-start' })}
  >
    <span className="truncate">{form.name}</span>
  </Link>
);

/** Archives or reactivates forms, each set in one request. */
export const useSetFormStatus = () =>
  useMutation(orpc.forms.setStatus.mutationOptions(useFormChange()));

/**
 * What a member does with a form: open its fields, settings or submissions, and for its channel's admins
 * duplicate, archive or reactivate, and delete it.
 */
export const useFormActions = (form: Pick<Form, 'id' | 'status' | 'canManage'>): RowAction[] => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const change = useFormChange();
  const setStatus = useSetFormStatus();
  const { deleteForms } = useDeleteForms();

  const duplicate = useMutation(
    orpc.forms.duplicate.mutationOptions({
      ...change,
      onSuccess: () => {
        change.onSuccess();
        toast({ title: t('form-duplicated', 'Form duplicated') });
      },
    }),
  );

  const pages: RowAction[] = [
    {
      value: 'builder',
      icon: <IconLayoutList />,
      label: t('form-fields', 'Fields'),
      onSelect: () => void navigate(formPath(form.id)),
    },
    {
      value: 'settings',
      icon: <IconSettings />,
      label: t('settings', 'Settings'),
      onSelect: () => void navigate(formPath(form.id, 'settings')),
    },
    {
      value: 'submissions',
      icon: <IconTable />,
      label: t('form-submissions', 'Submissions'),
      onSelect: () => void navigate(formPath(form.id, 'submissions')),
    },
  ];

  if (!form.canManage) return pages;

  const archived = form.status === 'archived';

  return [
    ...pages,
    {
      value: 'duplicate',
      icon: <IconCopy />,
      label: t('duplicate', 'Duplicate'),
      onSelect: () => duplicate.mutate({ id: form.id }),
    },
    {
      value: 'status',
      icon: archived ? <IconRestore /> : <IconArchive />,
      label: archived ? t('activate', 'Activate') : t('archive', 'Archive'),
      onSelect: () =>
        setStatus.mutate({ ids: [form.id], status: archived ? 'active' : 'archived' }),
    },
    {
      value: 'delete',
      icon: <IconTrash />,
      label: t('delete', 'Delete'),
      onSelect: () => void deleteForms([form.id]),
    },
  ];
};
