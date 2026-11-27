import { IconTrash } from '@tabler/icons-react';
import { Button, Card, Form, Switch, useConfirm } from 'erxes-ui';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import {
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useFormContext,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

/** One card of a settings page: a title, a line on what it's for, and its fields in a grid. */
export const SettingsCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Card>
    <Card.Header>
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
    <Card.Content>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </Card.Content>
  </Card>
);

/**
 * One field of a settings page's form: its label above the control `children` draws, a hint and
 * the field's error under it. `wide` spans the card's two columns; `bare` leaves out
 * `Form.Control`, for a control that is more than one element, such as a picker.
 */
export const SettingField = <T extends FieldValues, N extends FieldPath<T>>({
  name,
  label,
  required,
  rules,
  hint,
  wide,
  bare,
  children,
}: {
  name: N;
  label: string;
  required?: boolean;
  rules?: Omit<RegisterOptions<T, N>, 'valueAsNumber' | 'valueAsDate' | 'setValueAs'>;
  hint?: string;
  wide?: boolean;
  bare?: boolean;
  children: (field: ControllerRenderProps<T, N>) => ReactElement;
}) => {
  const { control } = useFormContext<T>();

  return (
    <Form.Field
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <Form.Item className={wide ? 'sm:col-span-2' : undefined}>
          <Form.Label required={required}>{label}</Form.Label>
          {bare ? children(field) : <Form.Control>{children(field)}</Form.Control>}
          {hint && <Form.Description>{hint}</Form.Description>}
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};

/** An on/off setting of a settings page's form: the switch, its label and a hint beside it. */
export const SwitchField = <T extends FieldValues>({
  name,
  label,
  hint,
}: {
  name: FieldPath<T>;
  label: string;
  hint: string;
}) => {
  const { control } = useFormContext<T>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item className="sm:col-span-2">
          <div className="flex items-start gap-3">
            <Form.Control>
              <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
            </Form.Control>
            <div className="flex flex-col gap-1">
              <Form.Label>{label}</Form.Label>
              <Form.Description>{hint}</Form.Description>
            </div>
          </div>
        </Form.Item>
      )}
    />
  );
};

/** The last card of a record's settings: what deleting it takes with it, and the button. */
export const DangerCard = ({
  title,
  description,
  disabled,
  onDelete,
}: {
  title: string;
  description: string;
  disabled: boolean;
  onDelete: () => void;
}) => (
  <Card>
    <Card.Header>
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
    <Card.Content>
      <Button variant="destructive" disabled={disabled} onClick={onDelete}>
        <IconTrash />
        {title}
      </Button>
    </Card.Content>
  </Card>
);

/** Whether a click on `link` would take the app to another page of its own. */
const leavesPage = (link: HTMLAnchorElement) =>
  link.origin === window.location.origin &&
  (!link.target || link.target === '_self') &&
  !link.hasAttribute('download') &&
  `${link.pathname}${link.search}` !== `${window.location.pathname}${window.location.search}`;

/**
 * While `dirty`, leaving asks first: a reload or closed tab through the browser's prompt, and a
 * click on a link to another page, core's or the plugin's, through core's confirm. Core's web runs
 * a plain `BrowserRouter`, so react-router's `useBlocker` isn't there to stop Back or a page change
 * through `navigate()`, such as core's top bar (erxes/erxes#10802).
 */
const useLeaveGuard = (dirty: boolean) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();
  const navigate = useNavigate();

  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();

    const ask = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;

      if (
        !(link instanceof HTMLAnchorElement) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !leavesPage(link)
      )
        return;

      // Before react-router's own handler, so the page stays until the member says so.
      event.preventDefault();
      event.stopPropagation();

      const to = `${link.pathname}${link.search}${link.hash}`;

      void confirm({
        message: t('leave-confirm', 'Discard your unsaved changes?'),
        options: { okLabel: t('discard', 'Discard'), variants: { ok: 'destructive' } },
      }).then(() => navigate(to));
    };

    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', ask, true);

    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', ask, true);
    };
  }, [dirty, confirm, navigate, t]);
};

/**
 * The bar at the foot of a settings page's one form: Discard, on once it changed, and Save. While
 * the form has changes, leaving the page asks first.
 */
export const SaveBar = ({
  dirty,
  saving,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
}) => {
  const { t } = useTranslation('frontline');

  useLeaveGuard(dirty);

  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
      <Button type="button" variant="ghost" disabled={!dirty} onClick={onDiscard}>
        {t('discard', 'Discard')}
      </Button>
      <Button type="submit" disabled={saving}>
        {saving ? t('saving', 'Saving…') : t('save', 'Save')}
      </Button>
    </div>
  );
};
