import {
  IconAlignLeft,
  IconBook,
  IconBrush,
  IconDots,
  IconForms,
  IconKey,
  IconLanguage,
  IconLetterCase,
  IconTag,
  IconTrash,
} from '@tabler/icons-react';
import {
  Button,
  CopyText,
  PanelField,
  PanelSection,
  Skeleton,
  TextField,
  type TRecordSlotProps,
} from 'erxes-ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InstallCode, scriptTag } from '~/shared/InstallCode.tsx';
import { InfoRow, PageLink, PanelSkeleton, ReadOnly } from '~/shared/Panel.tsx';
import { Badges, PickerField } from '~/shared/Pickers.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import {
  type HelpCenter,
  helpCenterPath,
  useCanManageHelpCenters,
  useDeleteHelpCenters,
  useEditHelpCenter,
  useFormNames,
  useFormOptions,
  useHelpCenter,
  useTopicOptions,
} from './queries.ts';

/** A slot's help center: a spinner while it loads, the refusal when the API gives one. */
export const WithHelpCenter = ({
  id,
  children,
}: {
  id: string;
  children: (center: HelpCenter) => ReactNode;
}) => {
  const center = useHelpCenter(id);

  if (center.isPending) return <PanelSkeleton />;

  if (center.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {center.error.message}
      </p>
    );
  }

  return children(center.data);
};

export const HelpCenterTitle = ({ contentId }: TRecordSlotProps) => {
  const center = useHelpCenter(contentId);

  if (center.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{center.data?.title ?? center.error?.message}</span>;
};

/** The header's menu, for help center managers: delete it. */
export const HelpCenterActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { deleteCenters } = useDeleteHelpCenters();

  if (!useCanManageHelpCenters()) return null;

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('help-center-menu', 'Help center actions')}
        >
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteCenters([contentId]),
        },
      ]}
    />
  );
};

/** A text field saved as it changes; an empty one clears it unless `required`. */
const Text = ({
  scope,
  label,
  icon,
  value,
  required,
  onSave,
}: {
  scope: string;
  label: string;
  icon: typeof IconLetterCase;
  value: string | null | undefined;
  required?: boolean;
  onSave: (value: string | null) => void;
}) => (
  <PanelField icon={icon} label={label}>
    <TextField
      scope={scope}
      value={value ?? ''}
      placeholder={label}
      onSave={(text) => {
        const next = text.trim();

        if (next === (value ?? '') || (required && !next)) return;

        onSave(next || null);
      }}
    />
  </PanelField>
);

/** What the help center is and which topic it shows. */
const Content = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);
  const topics = useTopicOptions();
  const scope = `frontline-help-center.${center.id}`;

  return (
    <PanelSection title={t('help-center', 'Help center')}>
      <Text
        scope={`${scope}.title`}
        label={t('title', 'Title')}
        icon={IconLetterCase}
        value={center.title}
        required
        onSave={(title) => title && edit({ title })}
      />
      <Text
        scope={`${scope}.description`}
        label={t('description', 'Description')}
        icon={IconAlignLeft}
        value={center.description}
        onSave={(description) => edit({ description })}
      />
      <Text
        scope={`${scope}.language`}
        label={t('language', 'Language')}
        icon={IconLanguage}
        value={center.languageCode}
        onSave={(languageCode) => edit({ languageCode })}
      />
      <PanelField icon={IconBook} label={t('kb-topic', 'Knowledge base topic')} cell={false}>
        <PickerField
          label={t('kb-topic', 'Knowledge base topic')}
          placeholder={t('none', 'None')}
          display={
            <span className="truncate">
              {topics.find((topic) => topic.value === center.kbTopicId)?.label}
            </span>
          }
          options={topics}
          value={center.kbTopicId ? [center.kbTopicId] : []}
          onValueChange={([kbTopicId]) => edit({ kbTopicId: kbTopicId ?? null })}
          noneLabel={t('none', 'None')}
        />
      </PanelField>
      <Text
        scope={`${scope}.kbLabel`}
        label={t('kb-label', 'Knowledge base label')}
        icon={IconTag}
        value={center.kbLabel}
        onSave={(kbLabel) => edit({ kbLabel })}
      />
      <InfoRow icon={IconKey} label={t('public-key', 'Public key')}>
        <CopyText value={center.publicKey}>{center.publicKey}</CopyText>
      </InfoRow>
      <div className="px-2 py-1">
        <InstallCode
          code={scriptTag(center.scriptUrl)}
          label={t('kb-install-code', 'Knowledge base install code')}
        />
      </div>
    </PanelSection>
  );
};

/** The forms its site offers, in order. */
const Forms = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);
  const [search, setSearch] = useState('');
  const options = useFormOptions(search);
  const names = useFormNames(center.formIds);
  const hidden = center.formIds.filter((id) => !names.has(id)).length;

  const labels = [
    ...center.formIds.flatMap((id) => names.get(id) ?? []),
    ...(hidden > 0
      ? [t('forms-elsewhere', { defaultValue: '{{count}} in other channels', count: hidden })]
      : []),
  ];

  return (
    <PanelSection title={t('forms', 'Forms')}>
      <PanelField icon={IconForms} label={t('forms', 'Forms')} cell={false}>
        <PickerField
          label={t('forms', 'Forms')}
          placeholder={t('no-forms', 'No forms')}
          display={<Badges labels={labels} max={3} />}
          options={options.data ?? []}
          loading={options.isPending}
          error={options.error}
          onSearchChange={setSearch}
          value={center.formIds}
          onValueChange={(formIds) => edit({ formIds })}
          multiple
        />
      </PanelField>
    </PanelSection>
  );
};

/** Its logo, colours, fonts, header and footer, on a page of their own. */
const Look = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');

  return (
    <PanelSection title={t('look', 'Look')}>
      <PanelField icon={IconBrush} label={t('appearance', 'Appearance')} cell={false}>
        <PageLink
          to={helpCenterPath(center.id, true)}
          label={t('edit-appearance', 'Edit appearance')}
          count=""
        />
      </PanelField>
    </PanelSection>
  );
};

/** The Detail tab: what the help center shows, saved as it changes, and a link to its look. */
export const HelpCenterDetail = ({ contentId }: TRecordSlotProps) => {
  const canManage = useCanManageHelpCenters();

  return (
    <WithHelpCenter id={contentId}>
      {(center) => (
        <ReadOnly when={!canManage}>
          <Content center={center} />
          <Forms center={center} />
          <Look center={center} />
        </ReadOnly>
      )}
    </WithHelpCenter>
  );
};
