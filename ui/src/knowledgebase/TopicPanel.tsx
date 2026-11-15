import { useMutation } from '@tanstack/react-query';
import { Skeleton } from 'erxes-ui';
import { type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { SidePanel } from '../shared/SidePanel.tsx';
import { type TopicDraft, TopicFields, topicDraftOf, topicInput } from './TopicFields.tsx';
import { KB_PATH } from '../paths.ts';
import { type Topic, useKbChange, useKbPanels, useTopic } from './useKnowledgeBase.ts';

/** Unsaved topic forms, kept while the page is open; the settings page shares them. */
export const useTopicDraft = draftsOf<TopicDraft>();

/** A new topic, which opens once created, or a change to `topic`, which closes the panel. */
const TopicForm = ({ topic }: { topic?: Topic }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { topic: panel } = useKbPanels();
  const change = useKbChange();
  const draft = useTopicDraft(topic?.id ?? 'new', topicDraftOf(topic));

  const create = useMutation(
    orpc.knowledgebase.topics.create.mutationOptions({
      ...change,
      onSuccess: async (created) => {
        draft.clear();
        await change.onSuccess();
        void navigate(`${KB_PATH}/${created.id}/articles`);
      },
    }),
  );

  const update = useMutation(
    orpc.knowledgebase.topics.update.mutationOptions({
      ...change,
      onSuccess: async () => {
        draft.clear();
        await change.onSuccess();
        panel.close();
      },
    }),
  );

  const { error, isPending } = topic ? update : create;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (topic) update.mutate({ id: topic.id, ...topicInput(draft.value) });
    else create.mutate(topicInput(draft.value));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TopicFields value={draft.value} onChange={draft.change} error={error} />
      <FormActions
        dirty={draft.dirty}
        onDiscard={draft.clear}
        disabled={isPending}
        submit={topic ? t('kb-save-changes', 'Save Changes') : t('kb-create-topic', 'Create Topic')}
      />
    </form>
  );
};

const EditTopic = ({ id }: { id: string }) => {
  const { data, error } = useTopic(id);

  if (error) return <p className="text-sm text-destructive-text">{error.message}</p>;

  return data ? <TopicForm key={data.id} topic={data} /> : <Skeleton className="h-60" />;
};

/** Create a topic, `?topic=new`, or edit one, `?topic=<id>`. */
export const TopicPanel = () => {
  const { t } = useTranslation('frontline');
  const { topic } = useKbPanels();

  return (
    <SidePanel
      open={Boolean(topic.value)}
      onClose={topic.close}
      title={
        topic.value === 'new' ? t('kb-new-topic', 'New Topic') : t('kb-edit-topic', 'Edit Topic')
      }
      description={t(
        'kb-topic-hint',
        'A topic holds a knowledge base: its categories and articles.',
      )}
    >
      {topic.value === 'new' ? <TopicForm /> : topic.value && <EditTopic id={topic.value} />}
    </SidePanel>
  );
};
