import { useState } from 'preact/hooks';
import { Articles, useArticleViews } from '../articles/Articles.tsx';
import type { ListArticles, ReadArticle, SearchArticles } from '../articles/api.ts';
import { BackIcon, BookIcon, CloseIcon } from '../shared/icons.tsx';
import { useText } from '../shared/text.ts';
import type { Site } from './api.ts';

/** A help center's knowledge base on a website: a launcher that opens its articles in a panel. */
export const KnowledgeBase = ({
  site,
  read,
  list,
  search,
}: {
  site: Site;
  read: ReadArticle;
  list: ListArticles;
  search: SearchArticles;
}) => {
  const [open, setOpen] = useState(false);
  const views = useArticleViews();
  const { t } = useText();
  const { helpCenter, topic } = site;
  const title = helpCenter.kbLabel || topic?.title || helpCenter.title;
  const color = helpCenter.color || topic?.color;

  return (
    <div class="fl" style={color ? { '--fl-color': color } : {}}>
      {open && (
        <section class="fl-panel" role="dialog" aria-label={title}>
          <header class="fl-bar">
            {views.back && (
              <button
                type="button"
                class="fl-icon-button"
                aria-label={t('Back')}
                onClick={views.back}
              >
                <BackIcon />
              </button>
            )}
            <h2>{title}</h2>
            <button
              type="button"
              class="fl-icon-button"
              aria-label={t('Close')}
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>
          <div class="fl-scroll">
            <Articles topic={site} read={read} list={list} search={search} views={views} />
          </div>
        </section>
      )}
      <button
        type="button"
        class="fl-launcher"
        aria-label={t(open ? 'Close {name}' : 'Open {name}', { name: title })}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <CloseIcon /> : <BookIcon />}
      </button>
    </div>
  );
};
