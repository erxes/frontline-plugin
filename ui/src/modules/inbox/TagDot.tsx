import { useQuery } from '@tanstack/react-query';
import { conversationTags } from './queries.ts';

/** The conversation tags among `tagIds`, in the tags' own order, from the one shared query. */
export const usePickedTags = (tagIds: string[]) =>
  (useQuery(conversationTags).data?.data ?? []).filter((tag) => tagIds.includes(tag.id));

/** A tag's colour as a dot; a tag without one shows none. */
export const TagDot = ({ color }: { color: string | null }) => {
  if (!color) return null;

  const dot: Record<`--${string}`, string> = { '--tag-color': color };

  return <span aria-hidden style={dot} className="size-2 shrink-0 rounded-full bg-(--tag-color)" />;
};
