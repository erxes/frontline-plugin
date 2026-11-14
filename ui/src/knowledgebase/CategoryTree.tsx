import { Select } from 'erxes-ui';
import type { CategoryRow } from './useKnowledgeBase.ts';

/** Space before a category's title, one step per level it sits below the top. */
export const Indent = ({ depth }: { depth: number }) =>
  Array.from({ length: depth }, (_, level) => (
    <span key={level} aria-hidden className="inline-block w-4 shrink-0" />
  ));

/** A select's options for the categories, in tree order and indented; `depth` adds to each. */
export const CategoryOptions = ({ rows, depth = 0 }: { rows: CategoryRow[]; depth?: number }) =>
  rows.map((row) => (
    <Select.Item key={row.id} value={row.id}>
      <Indent depth={row.depth + depth} />
      {row.title}
    </Select.Item>
  ));
