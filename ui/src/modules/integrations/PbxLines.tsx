import { memberQueries } from '@erxes/core-contract/client';
import { IconUsers } from '@tabler/icons-react';
import type { InferClientInputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import { memberName, PanelSection, useMembersById } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberSelect } from '~/shared/MemberPicker.tsx';
import { AddRow, ItemRow } from './parts.tsx';

type Lines = InferClientInputs<Client>['integrations']['call']['saveSettings'];

export type Queue = Lines['queues'][number];

export type Operator = Lines['operators'][number];

/** The queue numbers as the old form wrote them, in one field: `6500, 6501`. */
export const queueText = (queues: Queue[]) => queues.map((queue) => queue.queue).join(', ');

/**
 * The queues in `text`, split on commas and spaces as the old form's were, each once; a queue
 * already in `kept` keeps its name.
 */
export const queuesOf = (text: string, kept: Queue[] = []): Queue[] =>
  [...new Set(text.split(/[\s,]+/).filter(Boolean))].map((queue) => ({
    queue,
    name: kept.find((each) => each.queue === queue)?.name ?? '',
  }));

/**
 * The members who answer the PBX, each by its extension number on the PBX and password
 * (the SIP password); a member is picked before the extension. An extension in `softphones` has a saved
 * password, which gives its member the softphone on every page.
 */
export const OperatorList = ({
  operators,
  softphones = new Set(),
  onChange,
}: {
  operators: Operator[];
  softphones?: ReadonlySet<string>;
  onChange: (operators: Operator[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [userId, setUserId] = useState<string | null>(null);

  const members = useMembersById(
    operators.map((operator) => operator.userId),
    memberQueries,
  );

  return (
    <PanelSection title={t('operators', 'Operators')} icon={IconUsers}>
      <ul aria-label={t('operators', 'Operators')}>
        {operators.map((operator) => {
          const member = members.get(operator.userId);

          return (
            <ItemRow
              key={operator.extension}
              label={operator.extension}
              hint={[
                member && memberName(member),
                (operator.sipPassword || softphones.has(operator.extension)) &&
                  t('with-softphone', 'softphone'),
              ]
                .filter(Boolean)
                .join(', ')}
              onRemove={() =>
                onChange(operators.filter((each) => each.extension !== operator.extension))
              }
            />
          );
        })}
      </ul>
      <div className="px-2 py-1">
        <MemberSelect
          value={userId}
          onValueChange={setUserId}
          placeholder={t('operator-member', 'Member who answers')}
          aria-label={t('operator-member', 'Member who answers')}
        />
      </div>
      {userId && (
        <AddRow
          fields={[
            {
              name: 'extension',
              label: t('extension', 'Extension'),
              required: true,
              inputMode: 'numeric',
              pattern: {
                test: /^\d{1,30}$/,
                message: t(
                  'extension-digits',
                  'Enter the PBX extension number, such as 3001, not a username or email',
                ),
              },
            },
            { name: 'sipPassword', label: t('password', 'Password'), type: 'password' },
          ]}
          onAdd={({ extension = '', sipPassword }) => {
            onChange([
              ...operators.filter((each) => each.extension !== extension),
              { userId, extension, sipPassword: sipPassword || undefined },
            ]);
            setUserId(null);
          }}
        />
      )}
    </PanelSection>
  );
};
