import { IconBraces, IconEye, IconHash, IconLetterCase, IconNumbers } from '@tabler/icons-react';
import { Button, NumberField, PanelField, PanelSection, TextField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { ActionsMenu } from '~/shared/Records.tsx';
import { type Pipeline, useEditPipeline } from './queries.ts';

type Token = { token: string; label: string };

const twoDigits = (value: number) => value.toString().padStart(2, '0');

/** What a ticket number made today looks like: the prefix with its dates filled, then the digits. */
const numberPreview = (config: string | null, size: number | null) => {
  if (!size) return null;

  const today = new Date();

  const prefix = (config ?? '')
    .replaceAll('{year}', today.getFullYear().toString())
    .replaceAll('{month}', twoDigits(today.getMonth() + 1))
    .replaceAll('{day}', twoDigits(today.getDate()));

  return { prefix, sequence: '0'.repeat(size) };
};

/** The placeholders and separators a ticket's number and name are made of. */
const useTokens = () => {
  const { t } = useTranslation('frontline');

  return {
    number: [
      { token: '{year}', label: t('year', 'Year') },
      { token: '{month}', label: t('month', 'Month') },
      { token: '{day}', label: t('day', 'Day') },
      { token: '-', label: t('dash', 'Dash') },
      { token: '_', label: t('underscore', 'Underscore') },
      { token: '/', label: t('slash', 'Slash') },
    ],
    name: [
      { token: '{customer.firstName}', label: t('customers-first-name', "Customer's first name") },
      { token: '{customer.lastName}', label: t('customers-last-name', "Customer's last name") },
      { token: '{customer.email}', label: t('customers-email', "Customer's email") },
      { token: '{customer.phone}', label: t('customers-phone', "Customer's phone") },
      { token: '{company.name}', label: t('company-name', 'Company name') },
    ],
  };
};

/** A format edited in place, with a menu that appends a placeholder or separator and saves. */
const FormatField = ({
  scope,
  label,
  placeholder,
  value,
  tokens,
  onSave,
}: {
  scope: string;
  label: string;
  placeholder: string;
  value: string | null;
  tokens: Token[];
  onSave: (value: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <span className="flex items-center gap-1">
      <span className="min-w-0 flex-1">
        <TextField scope={scope} value={value ?? ''} placeholder={placeholder} onSave={onSave} />
      </span>
      <ActionsMenu
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('insert-attribute-into', 'Insert into {{field}}', { field: label })}
          >
            <IconBraces />
          </Button>
        }
        actions={tokens.map(({ token, label: name }) => ({
          value: token,
          icon: null,
          label: name,
          onSelect: () => onSave((value ?? '') + token),
        }))}
      />
    </span>
  );
};

/** How the pipeline's tickets are numbered and named, edited in place by its channel's admins. */
export const TicketFields = ({ pipeline }: { pipeline: Pipeline }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditPipeline(pipeline.id);
  const tokens = useTokens();
  const scope = `frontline-pipeline.${pipeline.id}`;
  const preview = numberPreview(pipeline.numberConfig, pipeline.numberSize);

  return (
    <PanelSection title={t('tickets', 'Tickets')}>
      <fieldset
        disabled={!pipeline.canManage}
        className="contents [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100"
      >
        <PanelField icon={IconHash} label={t('ticket-number', 'Ticket number')}>
          <FormatField
            scope={`${scope}.numberConfig`}
            label={t('ticket-number', 'Ticket number')}
            placeholder="{year}-"
            value={pipeline.numberConfig}
            tokens={tokens.number}
            onSave={(numberConfig) => edit({ numberConfig })}
          />
        </PanelField>
        <PanelField icon={IconNumbers} label={t('ticket-number-digits', 'Digits')}>
          <NumberField
            scope={`${scope}.numberSize`}
            value={pipeline.numberSize ?? 0}
            formatValue={(size) => (size ? size.toString() : t('none', 'None'))}
            onSave={(size) => edit({ numberSize: size || null })}
          />
        </PanelField>
        <PanelField icon={IconLetterCase} label={t('ticket-name', 'Ticket name')}>
          <FormatField
            scope={`${scope}.nameConfig`}
            label={t('ticket-name', 'Ticket name')}
            placeholder="{customer.firstName}"
            value={pipeline.nameConfig}
            tokens={tokens.name}
            onSave={(nameConfig) => edit({ nameConfig })}
          />
        </PanelField>
      </fieldset>
      <PanelField icon={IconEye} label={t('preview', 'Preview')} cell={false}>
        <output aria-live="polite" className="truncate px-2 font-mono text-xs">
          {preview ? (
            <>
              <span className="text-muted-foreground">{preview.prefix}</span>
              {preview.sequence}
            </>
          ) : (
            <span className="font-sans text-muted-foreground">
              {t('ticket-number-none', 'No number: set its digits, 1 to 8')}
            </span>
          )}
        </output>
      </PanelField>
    </PanelSection>
  );
};
