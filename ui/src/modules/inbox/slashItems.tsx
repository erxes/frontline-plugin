import { memberQueries } from '@erxes/core-contract/client';
import { IconAt, IconTemplate } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type Editor, editorText, jsonOf, memberName } from 'erxes-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';

type SlashItems = NonNullable<ComponentProps<typeof Editor>['additionalSlashMenuItems']>;

/** The composer's editor, as erxes-ui's slash menu hands it to each item. */
type ComposerEditor = Parameters<Extract<SlashItems, (...args: never[]) => unknown>>[0];

type Block = ComposerEditor['document'][number];

/** Stored editor blocks, as a template keeps them; BlockNote checks the rest as it inserts them. */
const Blocks = jsonOf(
  z
    .array(
      z.custom<Block>(
        (block) => typeof block === 'object' && block !== null && 'id' in block && 'type' in block,
      ),
    )
    .min(1),
);

/**
 * Puts a template where the cursor is: its blocks, or its HTML or text read as blocks. A template
 * typed into an empty line takes that line's place, and the cursor ends after it.
 */
const insertTemplate = (editor: ComposerEditor, content: string) => {
  const parsed = Blocks.safeParse(content);
  const blocks = parsed.success ? parsed.data : editor.tryParseHTMLToBlocks(content);
  const current = editor.getTextCursorPosition().block;
  const last = editor.insertBlocks(blocks, current, 'after').at(-1);

  if (Array.isArray(current.content) && current.content.length === 0)
    editor.removeBlocks([current]);

  if (last) editor.setTextCursorPosition(last, 'end');
};

/**
 * What the composer's slash menu adds to erxes-ui's formatting: the channel's response templates,
 * and in a note, the teammates to mention. Typing `/` and a name narrows them.
 */
export const useSlashItems = ({ channelId, note }: { channelId: string; note: boolean }) => {
  const { t } = useTranslation('frontline');

  const templates =
    useQuery(orpc.responseTemplates.list.queryOptions({ input: { channelId } })).data?.templates ??
    [];

  const members = useQuery({ ...memberQueries.team, enabled: note }).data?.data ?? [];

  return (editor: ComposerEditor) => [
    ...templates.map((template) => ({
      title: template.name,
      subtext: editorText(template.content).slice(0, 80),
      group: t('response-templates', 'Response templates'),
      icon: <IconTemplate size={18} />,
      onItemClick: () => insertTemplate(editor, template.content),
    })),
    ...(note
      ? members.map((member) => ({
          title: memberName(member),
          group: t('mention-teammate', 'Mention a teammate'),
          icon: <IconAt size={18} />,
          onItemClick: () => {
            editor.insertInlineContent([
              { type: 'mention', props: { _id: member.id, fullName: memberName(member) } },
              ' ',
            ]);
          },
        }))
      : []),
  ];
};
