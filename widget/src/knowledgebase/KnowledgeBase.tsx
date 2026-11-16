import { useState } from 'preact/hooks';
import { Articles, useArticleViews } from '../articles/Articles.tsx';
import type { ReadArticle } from '../articles/api.ts';
import { BackIcon, BookIcon, CloseIcon } from '../shared/icons.tsx';
import type { Site } from './api.ts';

/** A help center's knowledge base on a website: a launcher that opens its articles in a panel. */
export const KnowledgeBase = ({ site, read }: { site: Site; read: ReadArticle }) => {
  const [open, setOpen] = useState(false);
  const views = useArticleViews();
  const { helpCenter, topic } = site;
  const title = helpCenter.kbLabel || topic?.title || helpCenter.title;
  const color = helpCenter.color || topic?.color;

  return (
    <div class="fl" style={color ? { '--fl-color': color } : {}}>
      {open && (
        <section class="fl-panel" role="dialog" aria-label={title}>
          <header class="fl-bar">
            {views.back && (
              <button type="button" class="fl-icon-button" aria-label="Back" onClick={views.back}>
                <BackIcon />
              </button>
            )}
            <h2>{title}</h2>
            <button
              type="button"
              class="fl-icon-button"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          </header>
          <div class="fl-scroll">
            <Articles topic={site} read={read} views={views} />
          </div>
        </section>
      )}
      <button
        type="button"
        class="fl-launcher"
        aria-label={open ? `Close ${title}` : `Open ${title}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <CloseIcon /> : <BookIcon />}
      </button>
    </div>
  );
};
