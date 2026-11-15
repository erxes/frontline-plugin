import { IconRefresh, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  CopyText,
  Input,
  PanelSection,
  Table,
  type TRecordSlotProps,
} from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { type HelpCenter, useCanManageHelpCenters, useHelpCenterChange } from './queries.ts';
import { WithHelpCenter } from './HelpCenterPanel.tsx';

const StatusBadge = ({ status }: { status: 'pending' | 'active' | null }) => {
  const { t } = useTranslation('frontline');

  return status === 'active' ? (
    <Badge variant="success">{t('active', 'Active')}</Badge>
  ) : (
    <Badge variant="secondary">{t('pending', 'Pending')}</Badge>
  );
};

/** The records the member adds at their DNS host, each copied on click. */
const Records = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.Head>{t('type', 'Type')}</Table.Head>
          <Table.Head>{t('name', 'Name')}</Table.Head>
          <Table.Head>{t('value', 'Value')}</Table.Head>
          <Table.Head>{t('status', 'Status')}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {center.domainRecords.map((record) => (
          <Table.Row key={`${record.type}-${record.name}`}>
            <Table.Cell>{record.type}</Table.Cell>
            <Table.Cell>
              <CopyText value={record.name}>{record.name}</CopyText>
            </Table.Cell>
            <Table.Cell>
              <CopyText value={record.value}>{record.value}</CopyText>
            </Table.Cell>
            <Table.Cell>
              <StatusBadge status={record.status} />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};

/** The domain's three actions, sharing one refusal and one busy flag. */
const useDomainActions = () => {
  const change = useHelpCenterChange();
  const [error, setError] = useState<Error | null>(null);
  const done = { onSuccess: change.onSuccess, onError: setError, onMutate: () => setError(null) };
  const save = useMutation(orpc.helpCenters.domain.save.mutationOptions(done));
  const refresh = useMutation(orpc.helpCenters.domain.refresh.mutationOptions(done));
  const reset = useMutation(orpc.helpCenters.domain.reset.mutationOptions(done));

  return {
    save,
    refresh,
    reset,
    error,
    busy: save.isPending || refresh.isPending || reset.isPending,
  };
};

/** A connected domain: where it points, the records to add, and checking or disconnecting it. */
const Connected = ({
  center,
  actions,
}: {
  center: HelpCenter;
  actions: ReturnType<typeof useDomainActions>;
}) => {
  const { t } = useTranslation('frontline');
  const canManage = useCanManageHelpCenters();
  const active = center.domainStatus === 'active' && center.sslStatus === 'active';

  return (
    <>
      <p className="flex items-center gap-2 text-sm">
        {t('domain-points-to', 'Point it at {{target}}', { target: center.cnameTarget })}
        <StatusBadge status={active ? 'active' : 'pending'} />
      </p>
      <Records center={center} />
      {center.domainErrors.map((message) => (
        <p key={message} className="text-xs text-destructive-text">
          {message}
        </p>
      ))}
      {canManage && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={actions.busy}
            onClick={() => actions.refresh.mutate({ id: center.id })}
          >
            <IconRefresh />
            {t('check-again', 'Check again')}
          </Button>
          <Button
            variant="secondary"
            tone="destructive"
            disabled={actions.busy}
            onClick={() => actions.reset.mutate({ id: center.id })}
          >
            <IconTrash />
            {t('disconnect', 'Disconnect')}
          </Button>
        </div>
      )}
    </>
  );
};

const DomainForm = ({ center }: { center: HelpCenter }) => {
  const { t } = useTranslation('frontline');
  const canManage = useCanManageHelpCenters();
  const actions = useDomainActions();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    actions.save.mutate({
      id: center.id,
      hostname: textOf(new FormData(event.currentTarget).get('hostname')),
    });
  };

  if (!center.domainsAvailable) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {t('domains-off', 'Custom domains are not available on this installation.')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          name="hostname"
          aria-label={t('domain', 'Domain')}
          placeholder="help.example.com"
          defaultValue={center.hostname ?? ''}
          disabled={!canManage || actions.busy || center.hostname !== null}
        />
        {canManage && center.hostname === null && (
          <Button type="submit" disabled={actions.busy}>
            {t('connect', 'Connect')}
          </Button>
        )}
      </form>
      {center.hostname && <Connected center={center} actions={actions} />}
      {actions.error && (
        <p role="alert" className="text-xs text-destructive-text">
          {actions.error.message}
        </p>
      )}
    </div>
  );
};

/**
 * The Domain tab: the help center on the member's own domain. Cloudflare issues its certificate
 * once the CNAME and TXT records are in; a background job checks for a week.
 */
export const HelpCenterDomain = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');

  return (
    <WithHelpCenter id={contentId}>
      {(center) => (
        <PanelSection title={t('domain', 'Domain')}>
          <DomainForm center={center} />
        </PanelSection>
      )}
    </WithHelpCenter>
  );
};
