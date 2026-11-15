// The slots the knowledge base's records fill in core's side panel (`ui/src/config.tsx`), in one
// module so they load together.
import {
  ArticleActions,
  ArticleContent,
  ArticleDetailSlot,
  ArticleTitleSlot,
} from './ArticlePanel.tsx';
import { ArticleNew } from './ArticleNew.tsx';
import { CategoryNew } from './CategoryNew.tsx';
import { CategoryActions, CategoryDetail, CategoryTitle } from './CategoryPanel.tsx';
import { TopicNew } from './TopicNew.tsx';
import { TopicActions, TopicDetail, TopicTitle } from './TopicPanel.tsx';

export const Topic = {
  Title: TopicTitle,
  Actions: TopicActions,
  Detail: TopicDetail,
  New: TopicNew,
};

export const Category = {
  Title: CategoryTitle,
  Actions: CategoryActions,
  Detail: CategoryDetail,
  New: CategoryNew,
};

export const Article = {
  Title: ArticleTitleSlot,
  Actions: ArticleActions,
  Detail: ArticleDetailSlot,
  New: ArticleNew,
};

export { ArticleContent };
