import { useTranslation } from 'react-i18next';

/** How an answer reads as one line of text: a list joins its items, a file shows its name. */
export const useAnswerText = () => {
  const { t } = useTranslation('frontline');

  const text = (value: unknown): string => {
    if (Array.isArray(value)) return value.map(text).join(', ');

    if (typeof value === 'string' || typeof value === 'number') return `${value}`;

    if (typeof value === 'boolean') return value ? t('yes', 'Yes') : t('no', 'No');

    return typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      typeof value.name === 'string'
      ? value.name
      : '';
  };

  return text;
};
