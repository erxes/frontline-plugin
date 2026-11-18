import { IconCheck } from '@tabler/icons-react';
import { Button } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberSelect } from '~/shared/MemberPicker.tsx';
import { ListSelectionBar } from '~/shared/Records.tsx';
import { TagEditor } from './ConversationHeader.tsx';
import { type Conversation } from './queries.ts';
import { useAssign, useSetStatus } from './changes.ts';

/** The tags every one of `picked` has, which the bar's tag editor starts from. */
const sharedTags = (picked: Conversation[]) =>
  picked.reduce<string[]>(
    (shared, conversation, index) =>
      index === 0 ? conversation.tagIds : shared.filter((id) => conversation.tagIds.includes(id)),
    [],
  );

/**
 * The bar under the inbox for the picked conversations: assign them, set their tags or resolve
 * them, each in one request the API applies to all of them or none.
 */
export const BulkBar = ({ conversations }: { conversations: Conversation[] }) => {
  const { t } = useTranslation('frontline');
  const assign = useAssign();
  const setStatus = useSetStatus();

  return (
    <ListSelectionBar shown={conversations.map((conversation) => conversation.id)}>
      {(selected, clear) => (
        <>
          <MemberSelect
            value={null}
            onValueChange={(assigneeId) =>
              assign.mutate({ ids: selected, assigneeId }, { onSuccess: clear })
            }
            noneLabel={t('unassigned', 'Unassigned')}
            placeholder={t('assign', 'Assign')}
            className="w-40"
          />
          <TagEditor
            ids={selected}
            tagIds={sharedTags(conversations.filter((row) => selected.includes(row.id)))}
            label={t('tag', 'Tag')}
          />
          <Button
            variant="secondary"
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate({ ids: selected, status: 'resolved' }, { onSuccess: clear })
            }
          >
            <IconCheck />
            {t('resolve', 'Resolve')}
          </Button>
        </>
      )}
    </ListSelectionBar>
  );
};
