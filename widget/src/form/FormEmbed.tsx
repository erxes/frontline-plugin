import { useEffect, useRef, useState } from 'preact/hooks';
import { ChatIcon, CloseIcon } from '../shared/icons.tsx';
import type { FormApi, VisitorForm } from './api.ts';
import { FormView } from './FormView.tsx';

/** A website opens a form with this event on `window`, its code as the detail. */
const OPEN_EVENT = 'frontline:open-form';

/** The form tells the website it was sent with this event on `window`. */
const SENT_EVENT = 'frontline:form-submitted';

/**
 * Whether the form is open: an embedded form always is, a pop-up or shoutbox opens on the
 * visitor's click, and a dropdown or slide-in opens with the page. Any element with
 * `data-frontline-form-open="<code>"`, or the open event, opens it. Null until it first opens.
 */
const useOpen = (code: string, loadType: VisitorForm['form']['loadType']) => {
  const [open, setOpen] = useState<boolean | null>(
    loadType === 'popup' || loadType === 'shoutbox' ? null : true,
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;

      const trigger = event.target.closest('[data-frontline-form-open]');

      if (trigger?.getAttribute('data-frontline-form-open') === code) {
        event.preventDefault();
        setOpen(true);
      }
    };

    const onOpen = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === code) setOpen(true);
    };

    document.addEventListener('click', onClick);
    window.addEventListener(OPEN_EVENT, onOpen);

    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [code]);

  return [open, setOpen] as const;
};

/**
 * Focus follows the visitor's open and close: into the form, then back to the shoutbox's
 * launcher or the page's element that opened it. A form open with the page leaves focus alone.
 */
const useFocus = (shown: boolean | null) => {
  const panel = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;

      return;
    }

    if (shown) {
      if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
      panel.current?.focus();
    } else if (shown === false) (toggle.current ?? opener.current)?.focus();
  }, [shown]);

  return { panel, toggle };
};

/** A form on a website, shown the way its load type says. */
export const FormEmbed = ({
  api,
  code,
  visitorForm,
}: {
  api: FormApi;
  code: string;
  visitorForm: VisitorForm;
}) => {
  const { form } = visitorForm;
  const [shown, setOpen] = useOpen(code, form.loadType);
  const open = shown === true;
  const name = form.title || form.name;
  const { panel, toggle } = useFocus(shown);

  const view = (
    <FormView
      api={api}
      visitorForm={visitorForm}
      onSent={(submissionId) =>
        window.dispatchEvent(new CustomEvent(SENT_EVENT, { detail: { code, submissionId } }))
      }
    />
  );

  const style = form.primaryColor ? { '--fl-color': form.primaryColor } : {};

  if (form.loadType === 'embedded')
    return (
      <div class="fl fl-embedded" style={style}>
        {view}
      </div>
    );

  return (
    <div class={`fl fl-${form.loadType}`} style={style}>
      {/* Closing only hides the form, so the answers wait for the visitor's return. */}
      {shown !== null && (
        <>
          {open && form.loadType === 'popup' && (
            <div class="fl-overlay" onClick={() => setOpen(false)} />
          )}
          <section
            ref={panel}
            class="fl-panel"
            role="dialog"
            aria-label={name}
            tabIndex={-1}
            hidden={!open}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
          >
            <button
              type="button"
              class="fl-icon-button fl-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
            {view}
          </section>
        </>
      )}
      {form.loadType === 'shoutbox' && (
        <button
          ref={toggle}
          type="button"
          class="fl-launcher"
          aria-label={open ? `Close ${name}` : `Open ${name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <CloseIcon /> : <ChatIcon />}
        </button>
      )}
    </div>
  );
};
