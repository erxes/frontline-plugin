import { useTranslation } from 'react-i18next';

const round = (value: number) => Math.round(value * 10) / 10;

/** How long an average took, in the largest unit that reads well: "45 s", "12 min", "3.5 h", "2.1 d". */
export const useSpanText = () => {
  const { t } = useTranslation('frontline');

  return (seconds: number | null) => {
    if (seconds === null) return '–';

    if (seconds < 60) return t('span-seconds', '{{count}} s', { count: Math.round(seconds) });

    if (seconds < 3600)
      return t('span-minutes', '{{count}} min', { count: Math.round(seconds / 60) });

    if (seconds < 86_400) return t('span-hours', '{{count}} h', { count: round(seconds / 3600) });

    return t('span-days', '{{count}} d', { count: round(seconds / 86_400) });
  };
};
