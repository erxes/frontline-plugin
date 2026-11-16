import {
  IconAlignLeft,
  IconBook,
  IconBrush,
  IconCopyright,
  IconDots,
  IconKey,
  IconLanguage,
  IconLetterCase,
  IconPalette,
  IconSearch,
  IconTag,
  IconTrash,
} from '@tabler/icons-react';
import {
  Button,
  ColorPicker,
  CopyText,
  PanelField,
  PanelSection,
  Skeleton,
  TextField,
  type TRecordSlotProps,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InstallCode, scriptTag } from '~/shared/InstallCode.tsx';
import { InfoRow, PanelSkeleton, ReadOnly } from '~/shared/Panel.tsx';
import { PickerField } from '~/shared/Pickers.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import {
  type HelpCenter,
  useCanManageHelpCenters,
  useDeleteHelpCenters,
  useEditHelpCenter,
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
  const deleteCenters = useDeleteHelpCenters();

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

const COLORS = [
  'headerColor',
  'footerColor',
  'bodyColor',
  'linkColor',
  'primaryButtonColor',
] as const;

/** The help center's colours and the labels of its header and footer. */
const Look = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditHelpCenter(center.id);
  const scope = `frontline-help-center.${center.id}`;

  const names: Record<(typeof COLORS)[number], string> = {
    headerColor: t('header-color', 'Header colour'),
    footerColor: t('footer-color', 'Footer colour'),
    bodyColor: t('body-color', 'Body colour'),
    linkColor: t('link-color', 'Link colour'),
    primaryButtonColor: t('button-color', 'Button colour'),
  };

  return (
    <PanelSection title={t('look', 'Look')}>
      <PanelField icon={IconPalette} label={t('color', 'Colour')}>
        <ColorPicker
          aria-label={t('color', 'Colour')}
          value={center.color ?? undefined}
          onValueChange={(color) => edit({ color })}
          className="mx-2 w-12"
        />
      </PanelField>
      {COLORS.map((key) => (
        <PanelField key={key} icon={IconBrush} label={names[key]}>
          <ColorPicker
            aria-label={names[key]}
            value={center.styles[key]}
            onValueChange={(color) => edit({ styles: { ...center.styles, [key]: color } })}
            className="mx-2 w-12"
          />
        </PanelField>
      ))}
      <Text
        scope={`${scope}.wordmark`}
        label={t('wordmark', 'Wordmark')}
        icon={IconLetterCase}
        value={center.header.wordmark}
        onSave={(wordmark) =>
          edit({ header: { ...center.header, wordmark: wordmark ?? undefined } })
        }
      />
      <Text
        scope={`${scope}.searchPlaceholder`}
        label={t('search-placeholder', 'Search placeholder')}
        icon={IconSearch}
        value={center.header.searchPlaceholder}
        onSave={(searchPlaceholder) =>
          edit({ header: { ...center.header, searchPlaceholder: searchPlaceholder ?? undefined } })
        }
      />
      <Text
        scope={`${scope}.copyright`}
        label={t('copyright', 'Copyright')}
        icon={IconCopyright}
        value={center.footer.copyright}
        onSave={(copyright) =>
          edit({ footer: { ...center.footer, copyright: copyright ?? undefined } })
        }
      />
    </PanelSection>
  );
};

/** The Detail tab: what the help center shows and how it looks, saved as it changes. */
export const HelpCenterDetail = ({ contentId }: TRecordSlotProps) => {
  const canManage = useCanManageHelpCenters();

  return (
    <WithHelpCenter id={contentId}>
      {(center) => (
        <ReadOnly when={!canManage}>
          <Content center={center} />
          <Look center={center} />
        </ReadOnly>
      )}
    </WithHelpCenter>
  );
};
