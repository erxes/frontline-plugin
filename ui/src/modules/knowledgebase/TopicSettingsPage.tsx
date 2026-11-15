import { IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, Skeleton, toast } from 'erxes-ui';
import { type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';
import { FormActions } from '~/shared/Drafts.tsx';
import { TopicFields, topicDraftOf, topicInput } from './TopicFields.tsx';
import { useTopicDraft } from './TopicPanel.tsx';
import {
  KB_PATH,
  type Topic,
  useKbAccess,
  useKbChange,
  useKbRoute,
  useTopic,
} from './useKnowledgeBase.ts';

/** Asks for "delete" to be typed, then deletes the topic with its categories and articles. */
const DangerZone = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const confirm = useConfirmDelete();
  const change = useKbChange();

  const remove = useMutation(
    orpc.knowledgebase.topics.remove.mutationOptions({
      ...change,
      onSuccess: async () => {
        toast({ title: t('kb-topic-deleted', 'Topic deleted') });
        void navigate(KB_PATH);
        await change.onSuccess();
      },
    }),
  );

  const deleteTopic = async () => {
    await confirm(
      t('kb-confirm-delete-topic', {
        defaultValue:
          'Are you sure you want to delete "{{title}}"? All of its categories and articles will be removed.',
        title: topic.title,
      }),
    );
    remove.mutate({ id: topic.id });
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-destructive p-4">
      <h2 className="font-medium">{t('kb-danger-zone', 'Danger zone')}</h2>
      <p className="text-muted-foreground text-sm">
        {t(
          'kb-delete-topic-description',
          'Deleting this topic removes all of its categories and articles.',
        )}
      </p>
      <Button
        variant="secondary"
        tone="destructive"
        className="self-start"
        disabled={remove.isPending}
        onClick={() => void deleteTopic()}
      >
        <IconTrash />
        {t('kb-delete-topic', 'Delete Topic')}
      </Button>
    </section>
  );
};

/** The topic's fields, saved in place; the side panel's draft of the topic is the same one. */
const SettingsForm = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const change = useKbChange();
  const draft = useTopicDraft(topic.id, topicDraftOf(topic));

  const update = useMutation(
    orpc.knowledgebase.topics.update.mutationOptions({
      ...change,
      onSuccess: async () => {
        draft.clear();
        await change.onSuccess();
        toast({ title: t('kb-topic-saved', 'Topic saved') });
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate({ id: topic.id, ...topicInput(draft.value) });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TopicFields value={draft.value} onChange={draft.change} error={update.error} />
      <FormActions
        dirty={draft.dirty}
        onDiscard={draft.clear}
        disabled={update.isPending}
        submit={update.isPending ? t('saving', 'Saving…') : t('save', 'Save')}
      />
    </form>
  );
};

/**
 * A topic's settings: its fields and, past the danger line, its deletion. Members
 * without the topics permission read the topic here and change nothing.
 */
export const TopicSettingsPage = () => {
  const { topicId } = useKbRoute();
  const can = useKbAccess();
  const { data, error } = useTopic(topicId);

  if (error) return <p className="m-3 text-sm text-destructive-text">{error.message}</p>;

  if (!data) return <Skeleton className="m-3 h-60" />;

  return (
    <div className="flex h-full flex-col gap-8 overflow-auto p-6 md:max-w-2xl">
      {can.topics ? (
        <>
          <SettingsForm key={data.id} topic={data} />
          <DangerZone topic={data} />
        </>
      ) : (
        <dl className="flex flex-col gap-1 text-sm">
          <dt className="font-medium">{data.title}</dt>
          <dd className="text-muted-foreground">{data.description}</dd>
        </dl>
      )}
    </div>
  );
};
