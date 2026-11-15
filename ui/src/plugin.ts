// web loads `./config` on every page, so what it needs lives here, apart from the API client.

/** The plugin's name in core. */
export const PLUGIN = 'frontline';

/** The plugin's records core's side panel opens: `useOpenRecord().open({ contentType, contentId })`. */
export const CHANNEL_TYPE = `${PLUGIN}:channel`;

export const RESPONSE_TEMPLATE_TYPE = `${PLUGIN}:response-template`;
export const PIPELINE_TYPE = `${PLUGIN}:pipeline`;
