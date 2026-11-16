import {
  IconBook,
  IconCalendarPlus,
  IconDots,
  IconHelpCircle,
  IconLetterCase,
  IconPlus,
  IconUser,
  IconWorldWww,
} from '@tabler/icons-react';
import { Badge, Button, RecordTableInlineCell, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { SettingsList, DeleteRowAction } from '@/settings/Settings.tsx';
import { HELP_CENTER_TYPE } from '~/plugin.ts';
import { TextCell } from '~/shared/Records.tsx';
import { column, DateCell } from '~/shared/Table.tsx';
import {
  type HelpCenter,
  useCanManageHelpCenters,
  useDeleteHelpCenters,
  useHelpCenters,
  useTopicOptions,
} from './queries.ts';

/** The title opens the help center in core's side panel. */
const TitleCell = ({ center }: { center: HelpCenter }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => open({ contentType: HELP_CENTER_TYPE, contentId: center.id })}
      >
        {center.title}
      </Button>
    </RecordTableInlineCell>
  );
};

const DomainCell = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');

  if (!center.hostname) return <RecordTableInlineCell />;

  const active = center.domainStatus === 'active' && center.sslStatus === 'active';

  return (
    <RecordTableInlineCell>
      <span className="truncate">{center.hostname}</span>
      <Badge variant={active ? 'success' : 'secondary'}>
        {active ? t('active', 'Active') : t('pending', 'Pending')}
      </Badge>
    </RecordTableInlineCell>
  );
};

const MoreCell = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const deleteCenters = useDeleteHelpCenters();

  return (
    <DeleteRowAction
      label={t('help-center-actions', 'Actions for {{title}}', { title: center.title })}
      onDelete={() => void deleteCenters([center.id])}
    />
  );
};

const useColumns = (canManage: boolean) => {
  const { t } = useTranslation('frontline');
  const topics = useTopicOptions();
  const topicName = new Map(topics.map((topic) => [topic.value, topic.label]));

  return [
    ...(canManage
      ? [column<HelpCenter>('more', '', IconDots, 33, (row) => <MoreCell center={row} />)]
      : []),
    column<HelpCenter>('title', t('title', 'Title'), IconLetterCase, 240, (row) => (
      <TitleCell center={row} />
    )),
    column<HelpCenter>('topic', t('kb-topic', 'Knowledge base topic'), IconBook, 200, (row) => (
      <TextCell value={row.kbTopicId ? (topicName.get(row.kbTopicId) ?? '') : null} />
    )),
    column<HelpCenter>('domain', t('domain', 'Domain'), IconWorldWww, 240, (row) => (
      <DomainCell center={row} />
    )),
    column<HelpCenter>('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 140, (row) => (
      <DateCell date={row.createdAt} />
    )),
  ];
};

/** Settings › Help centers: public sites of a knowledge base topic, each opened in the side panel. */
export const HelpCentersPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const centers = useHelpCenters();
  const canManage = useCanManageHelpCenters();
  const topics = useTopicOptions();

  return (
    <SettingsList
      canManage={canManage}
      readOnly={false}
      id="frontline-help-centers"
      label={t('help-centers', 'Help centers')}
      allLabel={t('all-help-centers', 'All help centers')}
      action={
        <Button onClick={() => openNew(HELP_CENTER_TYPE)}>
          <IconPlus />
          {t('add-help-center', 'Add help center')}
        </Button>
      }
      fields={[
        { path: 'subject.title', label: t('title', 'Title'), type: 'text', icon: IconLetterCase },
        {
          path: 'subject.kbTopicId',
          label: t('kb-topic', 'Knowledge base topic'),
          type: 'select',
          icon: IconBook,
          options: topics,
        },
        {
          path: 'subject.createdBy',
          label: t('created-by', 'Created by'),
          type: 'member',
          icon: IconUser,
        },
        {
          path: 'subject.createdAt',
          label: t('created-at', 'Created at'),
          type: 'date',
          icon: IconCalendarPlus,
        },
      ]}
      columns={useColumns(canManage)}
      rows={centers.data?.helpCenters ?? []}
      isPending={centers.isPending}
      error={centers.error}
      empty={{
        icon: <IconHelpCircle />,
        title: t('no-help-centers-yet', 'No help centers yet'),
        description: t(
          'help-centers-empty',
          "A help center publishes a knowledge base topic's articles for your customers.",
        ),
      }}
    />
  );
};
