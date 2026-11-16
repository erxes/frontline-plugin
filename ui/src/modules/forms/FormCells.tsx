import {
  IconArchive,
  IconCopy,
  IconLayoutList,
  IconRestore,
  IconTable,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Badge, Button, toast, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { FORM_TYPE } from '~/plugin.ts';
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

/** The name opens the form in core's side panel. */
export const FormName = ({ form }: { form: Pick<Form, 'id' | 'name'> }) => {
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      className="min-w-0 justify-start"
      onClick={() => open({ contentType: FORM_TYPE, contentId: form.id })}
    >
      <span className="truncate">{form.name}</span>
    </Button>
  );
};

/** Archives or reactivates forms, each set in one request. */
export const useSetFormStatus = () =>
  useMutation(orpc.forms.setStatus.mutationOptions(useFormChange()));

/**
 * What a member does with a form: open its builder or submissions, and for its channel's admins
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
      onSuccess: async () => {
        await change.onSuccess();
        toast({ title: t('form-duplicated', 'Form duplicated') });
      },
    }),
  );

  const pages: RowAction[] = [
    {
      value: 'builder',
      icon: <IconLayoutList />,
      label: t('form-builder', 'Builder'),
      onSelect: () => void navigate(formPath(form.id, 'builder')),
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
