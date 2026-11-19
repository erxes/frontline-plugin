import type { InferClientInputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import { orpc } from '~/orpc.ts';

/**
 * How long the data screens pick from counts as fresh: channels, integrations, tags, response
 * templates, pipelines and surveys. Every change to them refetches them at once anyway.
 */
export const REFERENCE_MS = 5 * 60_000;

/**
 * How long the inbox's and tickets' own queries count as fresh, so opening, closing and reopening
 * one, or pointing at its link first, asks once. Their live signals refetch them as soon as
 * anything changes.
 */
export const FRESH_MS = 30_000;

/** The member's channels. */
export const channelsQuery = orpc.channels.list.queryOptions({
  input: {},
  staleTime: REFERENCE_MS,
});

/** The integrations of the member's channels. */
export const integrationsQuery = orpc.integrations.list.queryOptions({
  input: {},
  staleTime: REFERENCE_MS,
});

/** The organisation's tags of one type, as erxes-ui's tag lookups and `TagsField` take them. */
export const tagsOf = (type: NonNullable<InferClientInputs<Client>['tags']['list']['type']>) =>
  orpc.tags.list.queryOptions({ input: { type }, staleTime: REFERENCE_MS });

/** A channel's response templates, for the composer. */
export const templatesQuery = (channelId: string) =>
  orpc.responseTemplates.list.queryOptions({ input: { channelId }, staleTime: REFERENCE_MS });

/** The pipelines and statuses of the member's channels. */
export const choicesQuery = orpc.pipelines.choices.queryOptions({ staleTime: REFERENCE_MS });

/** The surveys a conversation can be sent. */
export const sendableSurveysQuery = (conversationId: string) =>
  orpc.surveys.sendable.queryOptions({ input: { conversationId }, staleTime: REFERENCE_MS });
