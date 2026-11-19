import {
  IconBook,
  IconChartBar,
  IconPlugConnected,
  IconChecklist,
  IconChevronDown,
  IconChevronLeft,
  IconCircles,
  IconForms,
  IconHelpCircle,
  IconHistory,
  IconInbox,
  IconListDetails,
  IconPhone,
  IconSettings,
  IconSitemap,
  IconTag,
  IconTicket,
  type Icon,
} from '@tabler/icons-react';
import {
  AppLayout,
  AppLayoutFooterLink,
  cn,
  NavigationMenuLinkItem,
  Sidebar,
  Skeleton,
} from 'erxes-ui';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { withText } from '~/i18n/withText.ts';
import { NavSkeleton } from '~/shared/NavSkeleton.tsx';
import { PLUGIN, TICKET_FIELDS } from '~/plugin.ts';

const ROOT = `/${PLUGIN}`;
const CALLS = `${ROOT}/calls`;
const SETTINGS = `${ROOT}/settings`;

// The inbox's count, queues and channels and the ticket pipelines load with the API client, after
// the page module.
const InboxNav = lazy(async () => ({ default: (await import('@/nav.ts')).InboxNav }));

const InboxGroups = lazy(async () => ({ default: (await import('@/nav.ts')).InboxGroups }));

const TicketsNav = lazy(async () => ({ default: (await import('@/nav.ts')).TicketsNav }));

/** The open page, with a placeholder while a lazy one loads. */
const Page = () => (
  <Suspense fallback={<Skeleton className="m-3 h-40" />}>
    <Outlet />
  </Suspense>
);

/** The Calls group: its history and its queues, open until the member folds it. */
const CallsGroup = () => {
  const { t } = useTranslation('frontline');
  const { pathname } = useLocation();
  const [open, setOpen] = useState(true);

  const items = [
    { name: t('history', 'History'), to: `${CALLS}/history`, icon: IconHistory },
    { name: t('queues', 'Queues'), to: `${CALLS}/queues`, icon: IconListDetails },
  ];

  const inCalls = pathname.startsWith(`${CALLS}/`);

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton isActive={inCalls && !open} onClick={() => setOpen((value) => !value)}>
        <IconPhone />
        <span className="min-w-0 flex-1 truncate">{t('calls', 'Calls')}</span>
        <IconChevronDown
          className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </Sidebar.MenuButton>
      {open && (
        <Sidebar.Sub>
          {items.map(({ name, to, icon: Icon }) => (
            <Sidebar.SubItem key={to}>
              <Sidebar.SubButton
                isActive={pathname === to || pathname.startsWith(`${to}/`)}
                render={<Link to={to} />}
              >
                <Icon />
                <span>{name}</span>
              </Sidebar.SubButton>
            </Sidebar.SubItem>
          ))}
        </Sidebar.Sub>
      )}
    </Sidebar.MenuItem>
  );
};

// The Mongolian text is its own chunk, loaded beside the page's. Words the text holds wait for it,
// so none shows in English first; the page and its chunk don't wait behind it.
const Texted = lazy(
  withText(async () => ({ default: ({ children }: { children: ReactNode }) => children })),
);

/** `children` once the Mongolian text is in, nothing before. */
const WithText = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={null}>
    <Texted>{children}</Texted>
  </Suspense>
);

/** A sidebar link: where it leads, its text's key and English, and its icon. */
type NavLink = [to: string, key: string, text: string, icon: Icon];

const links = (t: (key: string, text: string) => string, items: NavLink[]) =>
  items.map(([to, key, text, icon]) => (
    <NavigationMenuLinkItem key={to} to={to} name={t(key, text)} icon={icon} />
  ));

const MODULES: NavLink[] = [
  [`${ROOT}/forms`, 'forms', 'Forms', IconForms],
  [`${ROOT}/surveys`, 'surveys', 'Surveys', IconChecklist],
  [`${ROOT}/knowledgebase`, 'knowledge-base', 'Knowledge Base', IconBook],
  [`${ROOT}/help-centers`, 'help-centers', 'Help centers', IconHelpCircle],
  [`${ROOT}/reports`, 'reports', 'Reports', IconChartBar],
];

const SETTINGS_PAGES: NavLink[] = [
  [`${SETTINGS}/channels`, 'channels', 'Channels', IconCircles],
  [`${SETTINGS}/tags`, 'tags', 'Tags', IconTag],
  // Core keeps them and ticket fields, at its own Settings › Structure and › Properties.
  ['/settings/structure', 'branches-and-departments', 'Branches and departments', IconSitemap],
  [`/settings/properties/${TICKET_FIELDS}`, 'ticket-properties', 'Ticket properties', IconForms],
  [`${SETTINGS}/integrations`, 'integrations', 'Integrations', IconPlugConnected],
];

/** The app sidebar: the inbox and tickets with their counts, the other modules, and Calls. */
const FrontlineSidebar = () => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Sidebar.Group variant="flush">
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Suspense
              fallback={
                <NavigationMenuLinkItem
                  to={`${ROOT}/inbox`}
                  name={t('inbox', 'Inbox')}
                  icon={IconInbox}
                />
              }
            >
              <InboxNav />
            </Suspense>
            <Suspense
              fallback={
                <NavigationMenuLinkItem
                  to={`${ROOT}/tickets`}
                  name={t('tickets', 'Tickets')}
                  icon={IconTicket}
                />
              }
            >
              <TicketsNav />
            </Suspense>
            {links(t, MODULES)}
            <CallsGroup />
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <Suspense fallback={<NavSkeleton />}>
        <InboxGroups />
      </Suspense>
    </>
  );
};

/** Settings, pinned at the foot of the app sidebar. */
const SettingsLink = () => {
  const { t } = useTranslation('frontline');

  return <AppLayoutFooterLink to={SETTINGS} name={t('settings', 'Settings')} icon={IconSettings} />;
};

/**
 * Frontline's pages, as core's Contacts and Products draw theirs: the app sidebar, Settings
 * pinned at its foot, and the open page. The title is `./config`'s word, so it shows at once.
 */
export const FrontlineLayout = () => {
  const { t } = useTranslation('frontline');

  return (
    <AppLayout
      id={PLUGIN}
      title={t('frontline', 'Frontline')}
      footer={
        <WithText>
          <SettingsLink />
        </WithText>
      }
      sidebar={
        <WithText>
          <FrontlineSidebar />
        </WithText>
      }
    >
      <Page />
    </AppLayout>
  );
};

/** The settings sidebar: Exit settings back to the app, then each settings page. */
const SettingsSidebar = () => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Sidebar.Header variant="sticky">
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton render={<Link to={`${ROOT}/inbox`} />}>
              <IconChevronLeft />
              <span>{t('exit-settings', 'Exit settings')}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.GroupContent>
            <Sidebar.Menu>{links(t, SETTINGS_PAGES)}</Sidebar.Menu>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      </Sidebar.Content>
    </>
  );
};

/** The settings title, in the member's language. */
const SettingsTitle = () => {
  const { t } = useTranslation('frontline');

  return t('frontline-settings', 'Frontline settings');
};

/**
 * Frontline's settings, as core's `AppSettingsLayout` draws an app's: a sidebar of only them,
 * with Exit settings back to the app. Its title names the settings, so no group heading.
 */
export const SettingsLayout = () => (
  <AppLayout
    id={`${PLUGIN}-settings`}
    title={
      <WithText>
        <SettingsTitle />
      </WithText>
    }
    sidebar={
      <WithText>
        <SettingsSidebar />
      </WithText>
    }
  >
    <Page />
  </AppLayout>
);
