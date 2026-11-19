// web loads `./config` on every page, so what it needs lives here, apart from the API client.

/** The plugin's name in core. */
export const PLUGIN = 'frontline';

/** A record's own page under `/frontline/<path>`: its record type's `detailPath`, and its link. */
export const pageOf = (path: string) => (id: string) =>
  `/${PLUGIN}/${path}/${encodeURIComponent(id)}`;

/** The plugin's records core's side panel opens: `useOpenRecord().open({ contentType, contentId })`. */
export const CHANNEL_TYPE = `${PLUGIN}:channel`;

export const RESPONSE_TEMPLATE_TYPE = `${PLUGIN}:response-template`;
export const PIPELINE_TYPE = `${PLUGIN}:pipeline`;
export const KB_TOPIC_TYPE = `${PLUGIN}:kb-topic`;

export const KB_CATEGORY_TYPE = `${PLUGIN}:kb-category`;

export const KB_ARTICLE_TYPE = `${PLUGIN}:kb-article`;

export const TICKET_TYPE = `${PLUGIN}:ticket`;

/** The record type core keeps tickets' custom fields and timeline under. */
export const TICKET_FIELDS = `${PLUGIN}.ticket` as const;

export const HELP_CENTER_TYPE = `${PLUGIN}:help-center`;

export const FORM_TYPE = `${PLUGIN}:form`;

export const FORM_SUBMISSION_TYPE = `${PLUGIN}:form-submission`;

export const SURVEY_TYPE = `${PLUGIN}:survey`;

export const INTEGRATION_TYPE = `${PLUGIN}:integration`;

export const META_BOT_TYPE = `${PLUGIN}:meta-bot`;

export const ACCOUNT_TYPE = `${PLUGIN}:integration-account`;

export const CALL_TYPE = `${PLUGIN}:call`;

/** A conversation in the inbox; its draft is a new mail. */
export const CONVERSATION_TYPE = `${PLUGIN}:conversation`;

/** Where the inbox opens a conversation. */
export const conversationPath = (id: string) =>
  `/${PLUGIN}/inbox?conversationId=${encodeURIComponent(id)}`;
