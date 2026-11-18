import {
  IconBook,
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
} from '@tabler/icons-react';
import {
  AppLayout,
  AppLayoutFooterLink,
  cn,
  IconsProvider,
  NavigationMenuLinkItem,
  Sidebar,
  Skeleton,
} from 'erxes-ui';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { withText } from '~/i18n/withText.ts';
import { PLUGIN, STRUCTURE_PATH } from '~/plugin.ts';

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

/** The app sidebar: the inbox and tickets with their counts, the other modules, and Calls. */
const FrontlineSidebar = () => {
  const { t } = useTranslation('frontline');

  const items = [
    { name: t('forms', 'Forms'), to: `${ROOT}/forms`, icon: IconForms },
    { name: t('surveys', 'Surveys'), to: `${ROOT}/surveys`, icon: IconChecklist },
    { name: t('knowledge-base', 'Knowledge Base'), to: `${ROOT}/knowledgebase`, icon: IconBook },
  ];

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
            {items.map((item) => (
              <NavigationMenuLinkItem
                key={item.to}
                to={item.to}
                name={item.name}
                icon={item.icon}
              />
            ))}
            <CallsGroup />
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
      <Suspense fallback={null}>
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
 * pinned at its foot, and the open page. The icons members pick for channels and categories
 * load in the background. The title is `./config`'s word, so it shows at once.
 */
export const FrontlineLayout = () => {
  const { t } = useTranslation('frontline');

  return (
    <IconsProvider>
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
    </IconsProvider>
  );
};

/** The settings sidebar: Exit settings back to the app, then each settings page. */
const SettingsSidebar = () => {
  const { t } = useTranslation('frontline');

  const items = [
    { name: t('channels', 'Channels'), to: `${SETTINGS}/channels`, icon: IconCircles },
    { name: t('tags', 'Tags'), to: `${SETTINGS}/tags`, icon: IconTag },
    // Core keeps them, at its own Settings › Structure.
    {
      name: t('branches-and-departments', 'Branches and departments'),
      to: STRUCTURE_PATH,
      icon: IconSitemap,
    },
    {
      name: t('ticket-properties', 'Ticket properties'),
      to: `${SETTINGS}/ticket-properties`,
      icon: IconForms,
    },
    {
      name: t('help-centers', 'Help centers'),
      to: `${SETTINGS}/help-centers`,
      icon: IconHelpCircle,
    },
    {
      name: t('integrations', 'Integrations'),
      to: `${SETTINGS}/integrations`,
      icon: IconPlugConnected,
    },
  ];

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
            <Sidebar.Menu>
              {items.map((item) => (
                <NavigationMenuLinkItem
                  key={item.to}
                  to={item.to}
                  name={item.name}
                  icon={item.icon}
                />
              ))}
            </Sidebar.Menu>
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
