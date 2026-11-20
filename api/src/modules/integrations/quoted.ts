import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Tx } from '#/db/client.ts';
import { messages } from '#/db/inbox.ts';

const quoted = alias(messages, 'quoted');

/** The provider's id for the message a reply answers, when the member picked one it has. */
export const quotedIdOf = async (tx: Tx, messageId: string) => {
  const [row] = await tx
    .select({ externalId: quoted.externalId })
    .from(messages)
    .innerJoin(quoted, eq(quoted.id, messages.replyToId))
    .where(eq(messages.id, messageId));

  return row?.externalId ?? null;
};
