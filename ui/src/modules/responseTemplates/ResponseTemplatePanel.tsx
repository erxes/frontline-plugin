import { memberQueries } from '@erxes/core-contract/client';
import {
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconDots,
  IconLetterCase,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  MemberInline,
  PanelDescriptionField,
  PanelField,
  PanelSection,
  Select,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannel } from '@/channels/useChannels.ts';
import { orpc } from '~/orpc.ts';
import { ActionsMenu } from '~/shared/Records.tsx';
import {
  type ResponseTemplate,
  useDeleteTemplates,
  useManagedChannels,
  useResponseTemplate,
  useTemplateChange,
} from './useResponseTemplates.ts';

/** The panel header's title: the template's name. */
export const ResponseTemplateTitle = ({ contentId }: TRecordSlotProps) => {
  const template = useResponseTemplate(contentId);

  if (template.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{template.data?.name ?? template.error?.message}</span>;
};

/** The header's menu, for its channel's admins: delete it. */
export const ResponseTemplateActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const template = useResponseTemplate(contentId);
  const { deleteTemplates } = useDeleteTemplates();

  if (!template.data?.canManage) return null;

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('template-menu', 'Response template actions')}
        >
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteTemplates([contentId]),
        },
      ]}
    />
  );
};

/** The template's channel; its admins move it to another channel they are an admin of. */
const ChannelField = ({
  template,
  onMove,
}: {
  template: ResponseTemplate;
  onMove: (channelId: string) => void;
}) => {
  const channel = useChannel(template.channelId);
  const managed = useManagedChannels();

  if (!template.canManage) return <span className="px-2 text-xs">{channel.data?.name ?? '…'}</span>;

  const channels = managed.data ?? [];
  const nameOf = (id: string) => channels.find((each) => each.id === id)?.name ?? '…';

  return (
    <Select value={template.channelId} onValueChange={onMove}>
      <Select.Trigger variant="flush">
        <Select.Value>{(id: string) => nameOf(id)}</Select.Value>
      </Select.Trigger>
      <Select.Content>
        {channels.map((each) => (
          <Select.Item key={each.id} value={each.id}>
            {each.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The template's fields, edited in place by its channel's admins and read only for its members. */
const TemplateFields = ({ template }: { template: ResponseTemplate }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const update = useMutation(orpc.responseTemplates.update.mutationOptions(useTemplateChange()));

  const edit = (fields: { name?: string; content?: string; channelId?: string }) =>
    update.mutate({ id: template.id, ...fields });

  const scope = `frontline-response-template.${template.id}`;

  return (
    <PanelSection title={t('response-template', 'Response template')}>
      <fieldset
        disabled={!template.canManage}
        className="contents [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100"
      >
        <PanelField icon={IconLetterCase} label={t('name', 'Name')}>
          <TextField
            scope={`${scope}.name`}
            value={template.name}
            placeholder={t('name', 'Name')}
            onSave={(name) => {
              const next = name.trim();

              if (next && next !== template.name) edit({ name: next });
            }}
          />
        </PanelField>
        <PanelField icon={IconCircles} label={t('channel', 'Channel')} cell={false}>
          <ChannelField
            template={template}
            onMove={(channelId) => channelId !== template.channelId && edit({ channelId })}
          />
        </PanelField>
      </fieldset>
      <PanelField icon={IconUser} label={t('created-by', 'Created by')} cell={false}>
        <MemberInline memberId={template.createdBy} members={memberQueries} />
      </PanelField>
      <PanelField icon={IconCalendarPlus} label={t('created-at', 'Created at')} cell={false}>
        <span className="px-2 text-xs">{format.dateTime(template.createdAt)}</span>
      </PanelField>
      <PanelField icon={IconCalendarUp} label={t('updated-at', 'Updated at')} cell={false}>
        <span className="px-2 text-xs">{format.dateTime(template.updatedAt)}</span>
      </PanelField>
      <PanelDescriptionField
        label={t('content', 'Content')}
        scope={`${scope}.content`}
        value={template.content}
        readonly={!template.canManage}
        onSave={(content) => content !== template.content && edit({ content })}
      />
    </PanelSection>
  );
};

/** The Detail tab: the template's fields and its content, saved as they change. */
export const ResponseTemplateDetail = ({ contentId }: TRecordSlotProps) => {
  const template = useResponseTemplate(contentId);

  if (template.isPending) return <Spinner area="lg" />;

  if (template.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {template.error.message}
      </p>
    );
  }

  return <TemplateFields key={template.data.id} template={template.data} />;
};
