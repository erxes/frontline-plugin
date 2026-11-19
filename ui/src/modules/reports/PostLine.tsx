import { useQuery } from '@tanstack/react-query';
import { useOpenRecord } from 'erxes-ui';
import { orpc } from '~/orpc.ts';
import { CONVERSATION_TYPE } from '~/plugin.ts';

/**
 * A Facebook or Instagram post by the start of its text, read from Meta through a thread under
 * it, else by its id. It opens that thread in core's side panel.
 */
export const PostLine = ({
  postId,
  conversationId,
}: {
  postId: string;
  conversationId: string;
}) => {
  const { open } = useOpenRecord();

  const post = useQuery(
    orpc.integrations.meta.posts.get.queryOptions({ input: { conversationId } }),
  );

  return (
    <button
      type="button"
      className="block max-w-64 truncate text-left hover:underline"
      onClick={() => open({ contentType: CONVERSATION_TYPE, contentId: conversationId })}
    >
      {post.data?.content || postId}
    </button>
  );
};
