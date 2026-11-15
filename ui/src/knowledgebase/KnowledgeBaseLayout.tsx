import { IconBook } from '@tabler/icons-react';
import {
  addPluginStyles,
  buttonVariants,
  PageContainer,
  PageHeader,
  Resizable,
  Separator,
  Skeleton,
  stored,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';
import { z } from 'zod';
import { PLUGIN } from '../config.tsx';
import { CreateButton } from '../shared/List.tsx';
import { ArticlePanel } from './ArticlePanel.tsx';
import { CategoryPanel } from './CategoryPanel.tsx';
import { KbSidebar } from './KbSidebar.tsx';
import css from './styles.css?inline';
import { TopicPanel } from './TopicPanel.tsx';
import {
  KB_PATH,
  useKbAccess,
  useKbPanels,
  useKbRoute,
  useOldLink,
  useTopic,
} from './useKnowledgeBase.ts';

addPluginStyles(`${PLUGIN}:knowledgebase`, css);

const crumb = buttonVariants({ variant: 'ghost' });

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

/** The sidebar's width in pixels, kept in this browser under the old plugin's key. */
const sidebarWidth = stored({
  key: 'frontline:kb-sidebar-width',
  // z.custom rather than z.number(): core's contract already brings it into the page module.
  schema: z.custom<number>(
    (value) => Number.isInteger(value) && Number(value) >= MIN_WIDTH && Number(value) <= MAX_WIDTH,
  ),
  initial: 260,
});

/** Knowledge base, the open topic, then its open page. */
const Crumbs = () => {
  const { t } = useTranslation('frontline');
  const { topicId, section } = useKbRoute();
  const topic = useTopic(topicId).data;

  const sections = {
    articles: t('articles', 'Articles'),
    categories: t('kb-categories', 'Categories'),
    kbsettings: t('settings', 'Settings'),
  };

  return (
    <>
      <Link to={KB_PATH} className={crumb}>
        <IconBook />
        {t('knowledge-base', 'Knowledge Base')}
      </Link>
      {topicId && (
        <>
          <Separator.Inline />
          <Link to={`${KB_PATH}/${topicId}/articles`} className={crumb}>
            {topic?.title ?? '…'}
          </Link>
        </>
      )}
      {section && (
        <>
          <Separator.Inline />
          <Link to={`${KB_PATH}/${topicId}/${section}`} className={crumb}>
            {sections[section]}
          </Link>
        </>
      )}
    </>
  );
};

/** The open page's create button: an article or a category. */
const CreateAction = () => {
  const { t } = useTranslation('frontline');
  const { section } = useKbRoute();
  const can = useKbAccess();
  const panels = useKbPanels();

  if (section === 'articles')
    return (
      <CreateButton
        allowed={can.articles}
        label={t('kb-new-article', 'New Article')}
        onClick={() => panels.article.open('new')}
      />
    );

  if (section === 'categories')
    return (
      <CreateButton
        allowed={can.categories}
        label={t('kb-new-category', 'New Category')}
        onClick={() => panels.category.open('new')}
      />
    );

  return null;
};

/** The knowledge base: its topics beside the open page, under one header, with the side panels. */
export const KnowledgeBaseLayout = () => {
  const { topic } = useKbPanels();
  const [width, setWidth] = useAtom(sidebarWidth);

  useOldLink('createTopic', () => topic.open('new'));

  return (
    <Resizable.PanelGroup orientation="horizontal" className="h-full">
      <Resizable.Panel
        id="kb-sidebar"
        defaultSize={width}
        minSize={MIN_WIDTH}
        maxSize={MAX_WIDTH}
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) =>
          setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(size.inPixels))))
        }
      >
        <KbSidebar />
      </Resizable.Panel>
      <Resizable.Handle />
      <Resizable.Panel id="kb-page" className="min-w-0">
        <PageContainer>
          <PageHeader>
            <PageHeader.Start>
              <Crumbs />
            </PageHeader.Start>
            <PageHeader.End>
              <CreateAction />
            </PageHeader.End>
          </PageHeader>
          <Suspense fallback={<Skeleton className="m-3 h-40" />}>
            <Outlet />
          </Suspense>
        </PageContainer>
        <TopicPanel />
        <CategoryPanel />
        <ArticlePanel />
      </Resizable.Panel>
    </Resizable.PanelGroup>
  );
};
