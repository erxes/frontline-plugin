import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import { PLUGIN } from '~/plugin.ts';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { pageOptions, type PageParam, usePaged } from '~/shared/paging.ts';
import { SEARCH_PAUSE_MS } from '~/shared/Pickers.tsx';
import { useConfirmDelete } from '~/shared/Records.tsx';

export type HelpCenter = InferClientOutputs<Client>['helpCenters']['get'];

export type HelpCenterFields = Omit<InferClientInputs<Client>['helpCenters']['update'], 'id'>;

export const HELP_CENTERS_PATH = `/${PLUGIN}/help-centers`;

/** A help center's own page, or with `appearance`, the page that edits its look. */
export const helpCenterPath = (id: string, appearance?: boolean) =>
  `${HELP_CENTERS_PATH}/${encodeURIComponent(id)}${appearance ? '/appearance' : ''}`;

/** The help centers, newest first and a page at a time, narrowed by the filter bar. */
export const useHelpCenters = () => {
  const filter = useListFilterParams();

  return usePaged(
    useInfiniteQuery(
      orpc.helpCenters.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ ...filter, cursor }),
        ...pageOptions,
      }),
    ),
    (page) => page.helpCenters,
  );
};

/** Whether the member may change help centers, from a one-row list's answer. */
export const useCanManageHelpCenters = () =>
  useQuery(
    orpc.helpCenters.list.queryOptions({ input: { limit: 1 }, select: (data) => data.canManage }),
  ).data ?? false;

export const useHelpCenter = (id: string) =>
  useQuery(orpc.helpCenters.get.queryOptions({ input: { id }, enabled: Boolean(id) }));

/** Refetches the help center queries after a change, and shows a refusal. */
export const useHelpCenterChange = () => useChange(orpc.helpCenters.key());

/** Saves the given fields of one help center. */
export const useEditHelpCenter = (id: string) => {
  const update = useMutation(orpc.helpCenters.update.mutationOptions(useHelpCenterChange()));

  return (fields: HelpCenterFields) => update.mutate({ id, ...fields });
};

/** Asks for "delete" to be typed, then deletes the help centers and their domains. */
export const useDeleteHelpCenters = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.helpCenters.remove.mutationOptions(useHelpCenterChange()));

  const deleteCenters = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-help-centers-confirm', {
        defaultValue_one: 'Delete this help center? Its address and domain stop working.',
        defaultValue_other:
          'Delete {{count}} help centers? Their addresses and domains stop working.',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteCenters, isPending: remove.isPending };
};

/** The knowledge base topics a help center can show. */
export const useTopicOptions = () =>
  useQuery(
    orpc.knowledgebase.topics.list.queryOptions({
      input: {},
      select: (data) => data.topics.map((topic) => ({ value: topic.id, label: topic.title })),
    }),
  ).data ?? [];

const formsWhere = (path: string, value: string[]) =>
  JSON.stringify({ match: 'all', rules: [{ path, op: 'in', value }] });

/** The active forms of the member's channels a help center can offer, matching `search`. */
export const useFormOptions = (search: string) => {
  const [asked] = useDebounce(search, SEARCH_PAUSE_MS);

  return useQuery(
    orpc.forms.list.queryOptions({
      input: { search: asked || undefined, filter: formsWhere('subject.status', ['active']) },
      select: (data) => data.forms.map((form) => ({ value: form.id, label: form.name })),
    }),
  );
};

/** The names of the picked forms the member can see, by id. */
export const useFormNames = (ids: string[]) =>
  useQuery({
    ...orpc.forms.list.queryOptions({
      input: { filter: formsWhere('subject.id', ids) },
      select: (data) => new Map(data.forms.map((form) => [form.id, form.name])),
    }),
    enabled: ids.length > 0,
  }).data ?? new Map<string, string>();
