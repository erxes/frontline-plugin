import {
  IconBrush,
  IconCode,
  IconExternalLink,
  IconHelpCircle,
  IconSettings,
  IconWorldWww,
} from '@tabler/icons-react';
import { Badge, buttonVariants, Card, CopyText, Label } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { AppHeader } from '~/shared/Header.tsx';
import { InstallCode, scriptTag } from '~/shared/InstallCode.tsx';
import { SettingsCard } from '~/shared/Settings.tsx';
import {
  RecordWorkspace,
  WorkspaceHead,
  WorkspaceNav,
  type WorkspaceSection,
} from '~/shared/RecordWorkspace.tsx';
import { HelpCenterAppearance } from './HelpCenterAppearance.tsx';
import { DomainForm } from './HelpCenterDomain.tsx';
import { DeleteHelpCenter, HelpCenterGeneral } from './HelpCenterGeneral.tsx';
import {
  type HelpCenter,
  HELP_CENTER_SECTIONS,
  type HelpCenterSection,
  HELP_CENTERS_PATH,
  helpCenterPath,
  useCanManageHelpCenters,
  useHelpCenter,
  useTopicOptions,
} from './queries.ts';

/** The sections' names and icons, in the member's language. */
const useSections = (id: string): Record<HelpCenterSection, WorkspaceSection> => {
  const { t } = useTranslation('frontline');
  const to = (section: HelpCenterSection) => helpCenterPath(id, section);

  return {
    general: { to: to('general'), label: t('general', 'General'), icon: IconSettings },
    install: { to: to('install'), label: t('hc-install', 'Site and install'), icon: IconCode },
    domain: { to: to('domain'), label: t('domain', 'Domain'), icon: IconWorldWww },
    appearance: { to: to('appearance'), label: t('appearance', 'Appearance'), icon: IconBrush },
  };
};

/** The help center at the column's top: its title, its topic, and its own domain once live. */
const Head = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const topic = useTopicOptions().find((option) => option.value === center.kbTopicId)?.label;
  const live = center.domainStatus === 'active' && center.sslStatus === 'active';

  return (
    <WorkspaceHead
      to={helpCenterPath(center.id, 'general')}
      mark={<IconHelpCircle />}
      title={center.title}
      subtitle={topic ?? center.description ?? undefined}
      badges={
        center.hostname && (
          <Badge variant={live ? 'success' : 'secondary'}>
            {live ? center.hostname : t('domain-pending', 'Domain pending')}
          </Badge>
        )
      }
    />
  );
};

/** One labelled value of the install section. */
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <Label>{label}</Label>
    <div className="min-w-0 text-sm">{children}</div>
  </div>
);

/** Where the site lives, and the script that shows its articles on another website. */
const Install = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <SettingsCard
        title={t('hc-site', 'Site')}
        description={t(
          'hc-site-description',
          'The help center on its own address, ready to share.',
        )}
      >
        <Row label={t('hc-address', 'Address')}>
          <CopyText value={center.siteUrl}>
            <span className="break-all">{center.siteUrl}</span>
          </CopyText>
        </Row>
        <Row label={t('public-key', 'Public key')}>
          <CopyText value={center.publicKey}>{center.publicKey}</CopyText>
        </Row>
      </SettingsCard>
      <Card>
        <Card.Header>
          <Card.Title>{t('kb-install-code', 'Knowledge base install code')}</Card.Title>
          <Card.Description>
            {t(
              'hc-install-description',
              "Paste it before </body> on any page: the topic's articles open in a panel there.",
            )}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <InstallCode
            code={scriptTag(center.scriptUrl)}
            label={t('kb-install-code', 'Knowledge base install code')}
          />
        </Card.Content>
      </Card>
    </>
  );
};

/** The help center on the member's own domain, in a card. */
const Domain = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');

  return (
    <Card>
      <Card.Header>
        <Card.Title>{t('domain', 'Domain')}</Card.Title>
        <Card.Description>
          {t(
            'hc-domain-description',
            'Serve the site on a domain of your own, such as help.example.com. Its certificate comes once the records are in.',
          )}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <DomainForm center={center} />
      </Card.Content>
    </Card>
  );
};

const Section = ({
  section,
  center,
  editable,
}: {
  section: HelpCenterSection;
  center: HelpCenter;
  editable: boolean;
}) => {
  switch (section) {
    case 'install':
      return <Install center={center} />;
    case 'domain':
      return <Domain center={center} />;
    case 'appearance':
      return <HelpCenterAppearance key={center.id} center={center} editable={editable} />;
    default:
      return (
        <>
          <HelpCenterGeneral key={center.id} center={center} editable={editable} />
          {editable && <DeleteHelpCenter center={center} />}
        </>
      );
  }
};

/**
 * A help center on a page of its own: its sections in a column (General, Site and install,
 * Domain, Appearance) beside the open one, each laid out like core's settings pages. The header
 * opens the published site.
 */
export const HelpCenterPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '', section: param } = useParams();
  const section = HELP_CENTER_SECTIONS.find((one) => one === param) ?? 'general';
  const sections = useSections(id);
  const editable = useCanManageHelpCenters();
  const center = useHelpCenter(id);

  return (
    <RecordWorkspace
      header={
        <AppHeader
          icon={IconHelpCircle}
          app={{ label: t('help-centers', 'Help centers'), to: HELP_CENTERS_PATH }}
          levels={[
            { label: center.data?.title ?? '…', to: helpCenterPath(id, 'general') },
            { label: sections[section].label },
          ]}
        >
          {center.data && (
            <a
              href={center.data.siteUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              <IconExternalLink />
              {t('hc-open-site', 'Open the site')}
            </a>
          )}
        </AppHeader>
      }
      error={center.error}
      retry={() => void center.refetch()}
      nav={
        center.data && (
          <WorkspaceNav
            label={t('help-center-sections', 'Help center settings')}
            head={<Head center={center.data} />}
            sections={HELP_CENTER_SECTIONS.map((one) => sections[one])}
          />
        )
      }
    >
      {center.data && <Section section={section} center={center.data} editable={editable} />}
    </RecordWorkspace>
  );
};
