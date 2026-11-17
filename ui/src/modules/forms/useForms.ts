import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { tagsOf } from '~/shared/Pickers.tsx';
import { useConfirmDelete } from '~/shared/Records.tsx';

/** The organisation's form tags, for the list's tag cell and filter. */
export const formTags = tagsOf('form');

type Outputs = InferClientOutputs<Client>['forms'];

export type Form = Outputs['get'];

export type FormStatus = Form['status'];

export type LoadType = Form['loadType'];

export type FormField = Outputs['fields']['list'][number];

export type Submission = Outputs['submissions']['get'];

/** Where the forms live, as the old plugin had them. */
export const FORMS_PATH = `/${PLUGIN}/forms`;

/** A form's own pages, by the path segment after its id. */
export const formPath = (id: string, page: 'builder' | 'submissions') =>
  `${FORMS_PATH}/${encodeURIComponent(id)}/${page}`;

/** The statuses in the order the list groups them. */
export const FORM_STATUSES = ['active', 'archived'] as const satisfies readonly FormStatus[];

export const LOAD_TYPES = [
  'embedded',
  'popup',
  'shoutbox',
  'dropdown',
  'slideInLeft',
  'slideInRight',
] as const satisfies readonly LoadType[];

/** A status as members read it. */
export const useStatusNames = (): Record<FormStatus, string> => {
  const { t } = useTranslation('frontline');

  return { active: t('active', 'Active'), archived: t('archived', 'Archived') };
};

/** How an embed opens, as members read it. */
export const useLoadTypeNames = (): Record<LoadType, string> => {
  const { t } = useTranslation('frontline');

  return {
    embedded: t('form-embedded', 'Embedded'),
    popup: t('form-popup', 'Popup'),
    shoutbox: t('form-shoutbox', 'Shoutbox'),
    dropdown: t('form-dropdown', 'Dropdown'),
    slideInLeft: t('form-slide-in-left', 'Slide in from the left'),
    slideInRight: t('form-slide-in-right', 'Slide in from the right'),
  };
};

/** The forms of the member's channels, newest first, a page at a time, narrowed by the filter bar. */
export const useForms = () => {
  const filter = useListFilterParams();

  const query = useInfiniteQuery(
    orpc.forms.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...filter, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    forms: query.data?.pages.flatMap((page) => page.forms) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

export const useForm = (id: string) =>
  useQuery(orpc.forms.get.queryOptions({ input: { id }, enabled: Boolean(id) }));

/** The form's fields, step by step, in order. */
export const useFormFields = (formId: string) =>
  useQuery(orpc.forms.fields.list.queryOptions({ input: { formId }, enabled: Boolean(formId) }));

/** The form's submissions, newest first, a page at a time, narrowed by the filter bar. */
export const useSubmissions = (formId: string) => {
  const filter = useListFilterParams();

  const query = useInfiniteQuery(
    orpc.forms.submissions.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ formId, ...filter, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    submissions: query.data?.pages.flatMap((page) => page.submissions) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

/** Refetches every form query after a change, and shows a refusal. */
export const useFormChange = () => useChange(orpc.forms.key());

/** Saves one change to a form at a time, refetching the lists after it. */
export const useEditForm = (id: string) => {
  const update = useMutation(orpc.forms.update.mutationOptions(useFormChange()));

  return (fields: Omit<Parameters<typeof update.mutate>[0], 'id'>) =>
    update.mutate({ id, ...fields });
};

/** Asks for "delete" to be typed, then deletes the forms with their fields and submissions. */
export const useDeleteForms = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.forms.remove.mutationOptions(useFormChange()));

  const deleteForms = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-forms-confirm', {
        defaultValue_one: 'Delete this form and its submissions?',
        defaultValue_other: 'Delete {{count}} forms and their submissions?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteForms, isPending: remove.isPending };
};
