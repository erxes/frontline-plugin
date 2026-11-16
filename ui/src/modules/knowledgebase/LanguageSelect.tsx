import { Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_CODES, useLanguageName } from './useKnowledgeBase.ts';

const NO_LANGUAGE = 'none';

/** The language a topic is written in, or none. */
export const LanguageSelect = ({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string | null;
  onChange: (code: string | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const language = useLanguageName();

  return (
    <Select
      value={value ?? NO_LANGUAGE}
      onValueChange={(code) => onChange(code === NO_LANGUAGE ? null : code)}
    >
      <Select.Trigger id={id} aria-label={t('language', 'Language')}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={NO_LANGUAGE}>{t('kb-no-language', 'No language')}</Select.Item>
        {LANGUAGE_CODES.map((code) => (
          <Select.Item key={code} value={code}>
            {language(code)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};
