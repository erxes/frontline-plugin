import { IconPhone } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppHeader, type Crumb } from '~/shared/Header.tsx';
import { CALLS_PATH } from './queries.ts';

/** The calls pages' header: Calls, then each level. `children` is the page's one action. */
export const CallsHeader = ({ levels, children }: { levels: Crumb[]; children?: ReactNode }) => {
  const { t } = useTranslation('frontline');

  return (
    <AppHeader
      icon={IconPhone}
      app={{ label: t('calls', 'Calls'), to: `${CALLS_PATH}/history` }}
      levels={levels}
    >
      {children}
    </AppHeader>
  );
};
