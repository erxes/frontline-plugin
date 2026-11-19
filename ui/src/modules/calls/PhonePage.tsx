import { IconPhone } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Empty, PageContainer, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { ListError } from '~/shared/List.tsx';
import { CallsHeader } from './CallsHeader.tsx';
import { phoneLinesQuery } from './queries.ts';
import { AgentStatus } from './QueuesPage.tsx';
import { useLivePhone } from './softphone/live.ts';
import { PhonePanel } from './softphone/PhonePanel.tsx';

/**
 * The member's phone: dial a number, or take the call that rings, with its tools and note. The
 * softphone stays signed in on every page (core's floating widget); this page draws it. The
 * header pauses and resumes the member's queue calls.
 */
export const PhonePage = () => {
  const { t } = useTranslation('frontline');
  const lines = useQuery(phoneLinesQuery);
  const live = useLivePhone();

  return (
    <PageContainer>
      <CallsHeader levels={[{ label: t('softphone', 'Phone') }]}>
        <AgentStatus />
      </CallsHeader>
      {lines.error ? (
        <ListError error={lines.error} />
      ) : live ? (
        <PhonePanel live={live} />
      ) : lines.isPending || lines.data.length > 0 ? (
        <Skeleton radius="lg" className="mx-auto mt-8 h-96 w-full max-w-sm" />
      ) : (
        <Empty className="m-auto">
          <Empty.Header>
            <Empty.Media>
              <IconPhone />
            </Empty.Media>
            <Empty.Title>{t('no-phone-line', 'You have no phone line')}</Empty.Title>
            <Empty.Description>
              {t(
                'no-phone-line-description',
                'An admin gives your extension a SIP password in the PBX’s operators.',
              )}
            </Empty.Description>
          </Empty.Header>
        </Empty>
      )}
    </PageContainer>
  );
};
