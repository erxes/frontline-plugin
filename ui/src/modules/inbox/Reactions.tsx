import { IconMoodSmile } from '@tabler/icons-react';
import { Button, DropdownMenu, Toggle } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { type Message, useReact } from './queries.ts';

/** Meta takes only ❤️ from a page. */
const LOVE_ONLY = ['❤️'];

/** Emoji every other provider takes, Telegram's included. */
const EMOJIS = ['👍', '❤️', '🔥', '😁', '😢', '🙏'];

/** What members may put on a customer's message, by the conversation's kind; none where it can't show. */
const EMOJIS_OF: Record<string, string[] | undefined> = {
  facebook: LOVE_ONLY,
  instagram: LOVE_ONLY,
  telegram: EMOJIS,
  discord: EMOJIS,
  mail: EMOJIS,
};

/**
 * A message's emojis with how many have each. On a customer's message where the provider takes
 * them, a member's own are pressed and toggle, and the smiley adds one.
 */
export const Reactions = ({ message, kind }: { message: Message; kind: string }) => {
  const { t } = useTranslation('frontline');

  const react = useReact();

  const emojis = message.customerId ? EMOJIS_OF[kind] : undefined;

  if (!emojis && message.reactions.length === 0) return null;

  const toggle = (emoji: string, remove: boolean) =>
    react.mutate({ id: message.id, emoji, remove });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => (
        <Toggle
          key={reaction.emoji}
          variant="outline"
          size="sm"
          pressed={reaction.mine}
          aria-label={t('reaction-count', '{{emoji}} {{count}}', reaction)}
          disabled={!emojis || react.isPending}
          onPressedChange={(pressed) => toggle(reaction.emoji, !pressed)}
        >
          {reaction.emoji} {reaction.count}
        </Toggle>
      ))}
      {emojis && (
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={t('add-reaction', 'Add a reaction')}
              >
                <IconMoodSmile />
              </Button>
            }
          />
          <DropdownMenu.Content align="start">
            <div className="flex gap-1">
              {emojis.map((emoji) => (
                <DropdownMenu.Item
                  key={emoji}
                  aria-label={emoji}
                  disabled={react.isPending}
                  onClick={() => toggle(emoji, false)}
                >
                  {emoji}
                </DropdownMenu.Item>
              ))}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu>
      )}
    </div>
  );
};
