import { IconPlus, IconX } from '@tabler/icons-react';
import { Button, Input, Label, Select, useItemKeys } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { OPERATORS, useOperatorNames, VALUELESS } from './fieldTypes.ts';
import type { FormField } from './useForms.ts';

type Rule = FormField['logics'][number];

type Action = NonNullable<FormField['logicAction']>;

/** One rule: which other field, how its answer compares, and to what. */
const RuleRow = ({
  rule,
  others,
  change,
  remove,
}: {
  rule: Rule;
  others: FormField[];
  change: (rule: Partial<Rule>) => void;
  remove: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const operators = useOperatorNames();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={rule.fieldId}
        onValueChange={(fieldId) => typeof fieldId === 'string' && change({ fieldId })}
      >
        <Select.Trigger aria-label={t('logic-field', 'Field')} className="flex-1">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {others.map((other) => (
            <Select.Item key={other.id} value={other.id}>
              {other.label || t('field-untitled', 'Untitled field')}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      <Select
        value={rule.operator}
        onValueChange={(next) => {
          const operator = OPERATORS.find((each) => each === next);

          if (operator) change({ operator });
        }}
      >
        <Select.Trigger aria-label={t('logic-operator', 'Comparison')} className="w-36">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {OPERATORS.map((operator) => (
            <Select.Item key={operator} value={operator}>
              {operators[operator]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      {!VALUELESS.includes(rule.operator) && (
        <Input
          aria-label={t('logic-value', 'Value')}
          defaultValue={rule.value ?? ''}
          className="w-32"
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();

            if (value !== (rule.value ?? '')) change({ value });
          }}
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('logic-remove-rule', 'Remove rule')}
        onClick={remove}
      >
        <IconX />
      </Button>
    </div>
  );
};

/** Which way the rules work: none, show once they hold, or hide once they hold. */
const ActionSelect = ({
  action,
  onChange,
}: {
  action: Action | null;
  onChange: (action: Action | null) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <Select
      value={action ?? 'always'}
      onValueChange={(next) => onChange(next === 'show' || next === 'hide' ? next : null)}
    >
      <Select.Trigger aria-label={t('field-logic', 'Shows')}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="always">{t('logic-always', 'Always')}</Select.Item>
        <Select.Item value="show">{t('logic-show', 'Only when every rule holds')}</Select.Item>
        <Select.Item value="hide">{t('logic-hide', 'Until every rule holds')}</Select.Item>
      </Select.Content>
    </Select>
  );
};

/**
 * When the field shows: always, or shown or hidden once every rule on the other fields' answers
 * holds. `save` gets the whole set each time.
 */
export const FieldRules = ({
  field,
  fields,
  save,
}: {
  field: FormField;
  /** The form's fields, of which the rules can name the others. */
  fields: FormField[];
  save: (change: { logicAction: Action | null; logics: Rule[] }) => void;
}) => {
  const { t } = useTranslation('frontline');
  const others = fields.filter((other) => other.id !== field.id);
  const action = field.logicAction;
  const rules = field.logics;
  const keys = useItemKeys(rules.length);
  const [first] = others;

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('field-logic', 'Shows')}</Label>
      <ActionSelect
        action={action}
        onChange={(logicAction) => save({ logicAction, logics: logicAction ? rules : [] })}
      />
      {action &&
        rules.map((rule, index) => (
          <RuleRow
            key={keys.keyAt(index)}
            rule={rule}
            others={others}
            change={(patch) =>
              save({
                logicAction: action,
                logics: rules.map((each, at) => (at === index ? { ...each, ...patch } : each)),
              })
            }
            remove={() => {
              keys.removed(index);
              save({ logicAction: action, logics: rules.toSpliced(index, 1) });
            }}
          />
        ))}
      {action && first && (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            keys.added();
            save({
              logicAction: action,
              logics: [...rules, { fieldId: first.id, operator: 'hasAnyValue' }],
            });
          }}
        >
          <IconPlus />
          {t('logic-add-rule', 'Add rule')}
        </Button>
      )}
    </div>
  );
};
