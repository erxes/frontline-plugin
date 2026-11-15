// web loads `./config` on every page, so what it needs lives here, apart from the API client.

/** The plugin's name in core. */
export const PLUGIN = 'frontline';

/** The plugin's records core's side panel opens: `useOpenRecord().open({ contentType, contentId })`. */
export const CHANNEL_TYPE = `${PLUGIN}:channel`;

export const RESPONSE_TEMPLATE_TYPE = `${PLUGIN}:response-template`;
export const PIPELINE_TYPE = `${PLUGIN}:pipeline`;
export const KB_TOPIC_TYPE = `${PLUGIN}:kb-topic`;

export const KB_CATEGORY_TYPE = `${PLUGIN}:kb-category`;

export const KB_ARTICLE_TYPE = `${PLUGIN}:kb-article`;
