import { getI18n } from 'react-i18next';
import mn from './mn.json';

/**
 * Adds the plugin's Mongolian text to the host's i18n instance, under the `frontline` namespace.
 * English needs no bundle: every `t(key, 'English')` call carries it.
 */
export const registerTranslations = () => {
  getI18n().addResourceBundle('mn', 'frontline', mn, true, true);
};
