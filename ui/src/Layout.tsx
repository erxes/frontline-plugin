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
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { PLUGIN, STRUCTURE_PATH } from '~/plugin.ts';

const ROOT = `/${PLUGIN}`;
const CALLS = `${ROOT}/calls`;
const SETTINGS = `${ROOT}/settings`;

// The inbox's count, queues and channels load with the inbox's API client, after the page module.
const InboxNav = lazy(async () => ({ default: (await import('@/inbox/InboxNav.tsx')).InboxNav }));

const InboxGroups = lazy(async () => ({
  default: (await import('@/inbox/InboxNav.tsx')).InboxGroups,
}));

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

/**
 * Frontline's pages, as core's Contacts and Products draw theirs: the app sidebar, Settings
 * pinned at its foot, and the open page. The icons members pick for channels and categories
 * load in the background.
 */
export const FrontlineLayout = () => {
  const { t } = useTranslation('frontline');

  const items = [
    { name: t('tickets', 'Tickets'), to: `${ROOT}/tickets`, icon: IconTicket },
    { name: t('forms', 'Forms'), to: `${ROOT}/forms`, icon: IconForms },
    { name: t('surveys', 'Surveys'), to: `${ROOT}/surveys`, icon: IconChecklist },
    { name: t('knowledge-base', 'Knowledge Base'), to: `${ROOT}/knowledgebase`, icon: IconBook },
  ];

  return (
    <IconsProvider>
      <AppLayout
        id={PLUGIN}
        title={t('frontline', 'Frontline')}
        footer={
          <AppLayoutFooterLink to={SETTINGS} name={t('settings', 'Settings')} icon={IconSettings} />
        }
        sidebar={
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
        }
      >
        <Page />
      </AppLayout>
    </IconsProvider>
  );
};

/**
 * Frontline's settings, as core's `AppSettingsLayout` draws an app's: a sidebar of only them,
 * with Exit settings back to the app. Its title names the settings, so no group heading.
 */
export const SettingsLayout = () => {
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
    <AppLayout
      id={`${PLUGIN}-settings`}
      title={t('frontline-settings', 'Frontline settings')}
      sidebar={
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
      }
    >
      <Page />
    </AppLayout>
  );
};
