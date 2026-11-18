import { IconHelpCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Form, PageContainer, ScrollArea, Skeleton, toast } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { ListError } from '~/shared/List.tsx';
import { SaveBar, SettingsCard } from '~/shared/Settings.tsx';
import { ColorRow, FontRow, FooterColumns, ImageRow, type Look, TextRow } from './LookFields.tsx';
import {
  type HelpCenter,
  HELP_CENTERS_PATH,
  helpCenterPath,
  useCanManageHelpCenters,
  useHelpCenter,
  useHelpCenterChange,
} from './queries.ts';

const valuesOf = (center: HelpCenter): Look => ({
  color: center.color ?? '',
  backgroundImage: center.backgroundImage ?? '',
  styles: center.styles,
  header: center.header,
  footer: { ...center.footer, columns: center.footer.columns ?? [] },
});

/** The cards of the site's colours and type. */
const ColorCards = () => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <SettingsCard
        title={t('hc-colors', 'Colours')}
        description={t('hc-colors-description', 'The colours of the site around its pages.')}
      >
        <ColorRow name="styles.headerColor" label={t('header-color', 'Header')} />
        <ColorRow name="styles.bodyColor" label={t('body-color', 'Body')} />
        <ColorRow name="styles.footerColor" label={t('footer-color', 'Footer')} />
        <ColorRow name="styles.helpCenterColor" label={t('hc-main-color', 'Help center')} />
        <ColorRow name="styles.backgroundColor" label={t('background-color', 'Background')} />
        <ColorRow name="styles.activeTabColor" label={t('active-tab-color', 'Active tab')} />
      </SettingsCard>
      <SettingsCard
        title={t('hc-text', 'Text')}
        description={t('hc-text-description', 'The fonts and colours of the words and links.')}
      >
        <FontRow name="styles.baseFont" label={t('base-font', 'Base font')} />
        <FontRow name="styles.headingFont" label={t('heading-font', 'Heading font')} />
        <ColorRow name="styles.baseColor" label={t('base-color', 'Base colour')} />
        <ColorRow name="styles.headingColor" label={t('heading-color', 'Heading colour')} />
        <ColorRow name="styles.linkColor" label={t('link-color', 'Link')} />
        <ColorRow name="styles.linkHoverColor" label={t('link-hover-color', 'Link on hover')} />
      </SettingsCard>
      <SettingsCard
        title={t('hc-controls', 'Buttons and fields')}
        description={t('hc-controls-description', "The site's buttons and its fields' focus.")}
      >
        <ColorRow name="styles.primaryButtonColor" label={t('button-color', 'Primary button')} />
        <ColorRow
          name="styles.secondaryButtonColor"
          label={t('secondary-button-color', 'Secondary button')}
        />
        <ColorRow
          name="styles.dividerColor"
          label={t('divider-color', 'Heading divider and field focus')}
        />
      </SettingsCard>
    </>
  );
};

/** The cards of the logo, the topic's page, the header, the footer and raw HTML. */
const ContentCards = () => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <SettingsCard
        title={t('hc-brand', 'Logo and favicon')}
        description={t('hc-brand-description', 'The pictures that name the site.')}
      >
        <ImageRow name="styles.mainLogo" label={t('main-logo', 'Main logo')} />
        <ImageRow name="styles.favicon" label={t('favicon', 'Favicon')} />
      </SettingsCard>
      <SettingsCard
        title={t('hc-topic-look', 'Knowledge base')}
        description={t('hc-topic-look-description', "How the topic's pages open.")}
      >
        <ColorRow name="color" label={t('color', 'Colour')} />
        <ImageRow name="backgroundImage" label={t('kb-background-image', 'Background image')} />
      </SettingsCard>
      <SettingsCard
        title={t('hc-header', 'Header')}
        description={t(
          'hc-header-description',
          "The header's words; an empty one keeps the site's.",
        )}
      >
        <TextRow name="header.wordmark" label={t('wordmark', 'Wordmark')} />
        <TextRow name="header.homeLabel" label={t('home-label', 'Home tab')} />
        <TextRow name="header.formsLabel" label={t('forms-label', 'Forms tab')} />
        <TextRow
          name="header.searchPlaceholder"
          label={t('search-placeholder', 'Search placeholder')}
        />
      </SettingsCard>
      <SettingsCard
        title={t('hc-footer', 'Footer')}
        description={t('hc-footer-description', 'What the foot of every page says and links to.')}
      >
        <ImageRow name="footer.logo" label={t('footer-logo', 'Footer logo')} />
        <TextRow name="footer.copyright" label={t('copyright', 'Copyright')} />
        <TextRow name="footer.description" label={t('description', 'Description')} long />
        <FooterColumns />
      </SettingsCard>
      <SettingsCard
        title={t('hc-advanced', 'Advanced')}
        description={t('hc-advanced-description', 'HTML the site adds above and below each page.')}
      >
        <TextRow name="styles.headerHtml" label={t('header-html', 'Header HTML')} long />
        <TextRow name="styles.footerHtml" label={t('footer-html', 'Footer HTML')} long />
      </SettingsCard>
    </>
  );
};

/** The page's one form; members who can't manage help centers read it. */
const LookForm = ({ center, editable }: { center: HelpCenter; editable: boolean }) => {
  const { t } = useTranslation('frontline');
  const change = useHelpCenterChange();
  const form = useForm({ defaultValues: valuesOf(center) });

  const update = useMutation(
    orpc.helpCenters.update.mutationOptions({
      ...change,
      onSuccess: (saved) => {
        form.reset(valuesOf(saved));
        change.onSuccess();
        toast({ title: t('help-center-saved', 'Help center saved') });
      },
    }),
  );

  const save = form.handleSubmit(({ color, backgroundImage, styles, header, footer }) =>
    update.mutate({
      id: center.id,
      color: color || null,
      backgroundImage: backgroundImage || null,
      styles,
      header,
      footer: {
        ...footer,
        columns: footer.columns?.flatMap((column) => {
          const links = column.links.filter((link) => link.label.trim() && link.url.trim());

          return column.heading.trim() || links.length > 0 ? [{ ...column, links }] : [];
        }),
      },
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <fieldset disabled={!editable} className="contents">
          <ContentCards />
          <ColorCards />
        </fieldset>
        {editable && (
          <SaveBar
            dirty={form.formState.isDirty}
            saving={update.isPending}
            onDiscard={() => form.reset()}
          />
        )}
      </form>
    </Form>
  );
};

/**
 * A help center's look on a page of its own, laid out like core's settings pages: its logo,
 * colours, fonts, header and footer in one centered column of cards, and one Save.
 */
export const HelpCenterAppearancePage = () => {
  const { t } = useTranslation('frontline');
  const id = useParams().id ?? '';
  const editable = useCanManageHelpCenters();
  const { data, error } = useHelpCenter(id);

  return (
    <PageContainer>
      <AppHeader
        icon={IconHelpCircle}
        app={{ label: t('help-centers', 'Help centers'), to: HELP_CENTERS_PATH }}
        levels={[
          { label: data?.title ?? '…', to: helpCenterPath(id) },
          { label: t('appearance', 'Appearance') },
        ]}
      />
      <ScrollArea>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          {error ? (
            <ListError error={error} />
          ) : data ? (
            <LookForm key={data.id} center={data} editable={editable} />
          ) : (
            <Skeleton className="h-60" />
          )}
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
