import { useMutation } from '@tanstack/react-query';
import { Form, Input, Switch, Textarea, toast } from 'erxes-ui';
import { type FieldPathByValue, useForm, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { type Channel, useChannelChange } from './useChannels.ts';

type Policy = Channel['replyPolicy'];

/** The form keeps each number as typed; empty keeps none. */
type Values = {
  firstReplyMinutes: string;
  nextReplyMinutes: string;
  warnBeforeMinutes: string;
  reassignAfterMinutes: string;
  autoAssign: boolean;
  maxOpenPerMember: string;
  awayMessage: string;
};

const MAX_MINUTES = 43_200;

const MAX_OPEN = 500;

const valuesOf = (policy: Policy): Values => ({
  firstReplyMinutes: String(policy.firstReplyMinutes ?? ''),
  nextReplyMinutes: String(policy.nextReplyMinutes ?? ''),
  warnBeforeMinutes: String(policy.warnBeforeMinutes ?? ''),
  reassignAfterMinutes: String(policy.reassignAfterMinutes ?? ''),
  autoAssign: policy.autoAssign,
  maxOpenPerMember: String(policy.maxOpenPerMember ?? ''),
  awayMessage: policy.awayMessage ?? '',
});

const numberOf = (typed: string) => (typed.trim() ? Number(typed) : undefined);

const policyOf = (values: Values): Policy => ({
  firstReplyMinutes: numberOf(values.firstReplyMinutes),
  nextReplyMinutes: numberOf(values.nextReplyMinutes),
  warnBeforeMinutes: numberOf(values.warnBeforeMinutes),
  reassignAfterMinutes: numberOf(values.reassignAfterMinutes),
  autoAssign: values.autoAssign,
  maxOpenPerMember: numberOf(values.maxOpenPerMember),
  awayMessage: values.awayMessage.trim() || undefined,
});

/** A whole number of minutes, or of conversations, up to `max`; empty keeps none. */
const NumberRow = ({
  name,
  label,
  hint,
  max,
  disabled,
}: {
  name: FieldPathByValue<Values, string>;
  label: string;
  hint: string;
  max: number;
  disabled: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<Values>();

  return (
    <Form.Field
      control={control}
      name={name}
      rules={{
        validate: (typed) => {
          const value = numberOf(typed);

          return (
            value === undefined ||
            (Number.isInteger(value) && value > 0 && value <= max) ||
            t('whole-number-up-to', 'A whole number from 1 to {{max}}', { max })
          );
        },
      }}
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{label}</Form.Label>
          <Form.Control>
            <Input
              {...field}
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              disabled={disabled}
              placeholder={t('no-target', 'None')}
            />
          </Form.Control>
          <Form.Description>{hint}</Form.Description>
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};

/** How soon each reply is due, and the warning before. */
const TargetFields = ({ disabled }: { disabled: boolean }) => {
  const { t } = useTranslation('frontline');

  return (
    <Form.Section
      title={t('reply-targets', 'Reply targets')}
      description={t(
        'reply-targets-hint',
        'How soon a customer who writes gets a reply. The assignee, or the available members, hear before it is due, and the channel’s admins once it is overdue.',
      )}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberRow
          name="firstReplyMinutes"
          label={t('first-reply-minutes', 'First reply, minutes')}
          hint={t('first-reply-hint', 'To a new conversation.')}
          max={MAX_MINUTES}
          disabled={disabled}
        />
        <NumberRow
          name="nextReplyMinutes"
          label={t('next-reply-minutes', 'Next replies, minutes')}
          hint={t('next-reply-hint', 'Each time the customer writes again.')}
          max={MAX_MINUTES}
          disabled={disabled}
        />
        <NumberRow
          name="warnBeforeMinutes"
          label={t('warn-before-minutes', 'Warn before, minutes')}
          hint={t('warn-before-hint', 'Before a reply is due.')}
          max={MAX_MINUTES}
          disabled={disabled}
        />
      </div>
    </Form.Section>
  );
};

/** Who gets the channel's conversations, and when one moves on. */
const AssignmentFields = ({ disabled }: { disabled: boolean }) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<Values>();

  return (
    <Form.Section
      title={t('assignment', 'Assignment')}
      description={t(
        'assignment-hint',
        'Members who set themselves away get no conversations from here.',
      )}
    >
      <Form.Field
        control={control}
        name="autoAssign"
        render={({ field }) => (
          <Form.Item>
            <div className="flex items-start gap-3">
              <Form.Control>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </Form.Control>
              <div className="flex flex-col gap-1">
                <Form.Label>{t('assign-automatically', 'Assign automatically')}</Form.Label>
                <Form.Description>
                  {t(
                    'assign-automatically-hint',
                    'A waiting conversation goes to the available member with the fewest open ones. A conversation an AI agent answers stays with it until it hands off.',
                  )}
                </Form.Description>
              </div>
            </div>
          </Form.Item>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberRow
          name="maxOpenPerMember"
          label={t('max-open-per-member', 'Open conversations per member, at most')}
          hint={t('max-open-hint', 'Past it, a member gets no more.')}
          max={MAX_OPEN}
          disabled={disabled}
        />
        <NumberRow
          name="reassignAfterMinutes"
          label={t('reassign-after-minutes', 'Reassign after, minutes')}
          hint={t(
            'reassign-after-hint',
            'An assignee who leaves the customer waiting this long loses the conversation to the next available member.',
          )}
          max={MAX_MINUTES}
          disabled={disabled}
        />
      </div>
    </Form.Section>
  );
};

/** What a customer reads when nobody is there. */
const AwayFields = ({ disabled }: { disabled: boolean }) => {
  const { t } = useTranslation('frontline');
  const { control } = useFormContext<Values>();

  return (
    <Form.Section
      title={t('away-message', 'Away message')}
      description={t(
        'away-message-hint',
        'Sent once when a customer starts waiting and every member is away. A website messenger shows its own away text instead.',
      )}
    >
      <Form.Field
        control={control}
        name="awayMessage"
        render={({ field }) => (
          <Form.Item>
            <Form.Control>
              <Textarea
                {...field}
                rows={3}
                maxLength={1000}
                disabled={disabled}
                aria-label={t('away-message', 'Away message')}
              />
            </Form.Control>
          </Form.Item>
        )}
      />
    </Form.Section>
  );
};

/**
 * The channel's reply rules: reply targets and their warning, assignment, and the away message.
 * Save sends them all; only the channel's admins change them.
 */
export const ChannelReplies = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const disabled = !channel.canManage;
  const form = useForm<Values>({ defaultValues: valuesOf(channel.replyPolicy) });
  const save = useMutation(orpc.channels.setReplyPolicy.mutationOptions(useChannelChange()));

  const submit = form.handleSubmit((values) =>
    save.mutate(
      { id: channel.id, replyPolicy: policyOf(values) },
      {
        onSuccess: (saved) => {
          form.reset(valuesOf(saved.replyPolicy));
          toast({ variant: 'success', title: t('reply-rules-saved', 'Reply rules saved') });
        },
      },
    ),
  );

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
        <TargetFields disabled={disabled} />
        <AssignmentFields disabled={disabled} />
        <AwayFields disabled={disabled} />
        {!disabled && <Form.SaveBar saving={save.isPending} />}
      </form>
    </Form>
  );
};
