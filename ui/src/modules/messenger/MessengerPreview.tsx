import { orpc as core, memberQueries } from '@erxes/core-contract/client';
import { fileIdOf } from '@frontline/api/core-file';
import { PREVIEW_MESSAGE, PREVIEW_READY, type PreviewMessage } from '@frontline/api/messenger/view';
import { IconDeviceDesktop, IconDeviceMobile } from '@tabler/icons-react';
import { useQueries } from '@tanstack/react-query';
import { memberName, ToggleGroup, useMembersById } from 'erxes-ui';
import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MessengerForm, MessengerSettings } from './queries.ts';

const DEVICES = {
  desktop: 'h-175 w-130',
  mobile: 'h-175 w-96',
} as const;

type Device = keyof typeof DEVICES;

const isDevice = (value: unknown): value is Device => typeof value === 'string' && value in DEVICES;

const isReady = (data: unknown) =>
  typeof data === 'object' && data !== null && 'type' in data && data.type === PREVIEW_READY;

/** A page with nothing on it but the messenger's preview script. */
const pageOf = (previewUrl: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><script type="module" src="${previewUrl}"></script></body></html>`;

/**
 * Where the preview's frame loads each image in `urls`: a core file at its signed download
 * address, null until core gives it, and any other address as it is. Core serves its files to
 * signed-in members, and the frame has an origin of its own.
 */
const useFrameImages = (urls: (string | null)[]) => {
  const ids = [...new Set(urls.flatMap((url) => (url && fileIdOf(url)) || []))];

  const files = useQueries({
    queries: ids.map((id) => core.files.get.queryOptions({ input: { id } })),
  });

  return (url: string | null) => {
    const id = url && fileIdOf(url);

    return id ? (files[ids.indexOf(id)]?.data?.downloadUrl ?? null) : url;
  };
};

/** What the preview draws: the form's unsaved settings and the team they name. */
const usePreviewMessage = (name: string): PreviewMessage => {
  const { control } = useFormContext<MessengerForm>();
  const form = useWatch({ control, compute: (values: MessengerForm) => values });
  const members = useMembersById(form.supporterIds, memberQueries);

  const team = form.supporterIds.flatMap((id) => {
    const member = members.get(id);

    return member ? [{ id, name: memberName(member), avatarUrl: member.avatarUrl ?? null }] : [];
  });

  const shown = useFrameImages([
    form.logo,
    form.launcherLogo,
    ...team.map((member) => member.avatarUrl),
  ]);

  return {
    type: PREVIEW_MESSAGE,
    name,
    config: { ...form, logo: shown(form.logo), launcherLogo: shown(form.launcherLogo) },
    supporters: team.map((member) => ({ ...member, avatarUrl: shown(member.avatarUrl) })),
  };
};

/**
 * The messenger as a visitor sees it: the real widget in a page of its own, drawn from the form's
 * unsaved values on a desktop or a phone. It connects no visitor and sends nothing.
 */
export const MessengerPreview = ({ messenger }: { messenger: MessengerSettings }) => {
  const { t } = useTranslation('frontline');
  const [device, setDevice] = useState<Device>('desktop');
  const frame = useRef<HTMLIFrameElement>(null);
  const message = usePreviewMessage(messenger.name);
  const latest = useRef(message);

  useEffect(() => {
    latest.current = message;
    frame.current?.contentWindow?.postMessage(message, '*');
  }, [message]);

  // The preview asks for the settings once its script listens.
  useEffect(() => {
    const ready = (event: MessageEvent<unknown>) => {
      if (event.source === frame.current?.contentWindow && isReady(event.data))
        frame.current?.contentWindow?.postMessage(latest.current, '*');
    };

    window.addEventListener('message', ready);

    return () => window.removeEventListener('message', ready);
  }, []);

  return (
    <section
      aria-label={t('messenger-preview', 'Preview')}
      className="flex shrink-0 flex-col items-center gap-3 self-center xl:sticky xl:top-6 xl:self-start"
    >
      <ToggleGroup
        value={[device]}
        onValueChange={([value]) => {
          if (isDevice(value)) setDevice(value);
        }}
        size="sm"
        variant="outline"
      >
        <ToggleGroup.Item value="desktop" aria-label={t('messenger-preview-desktop', 'Desktop')}>
          <IconDeviceDesktop />
        </ToggleGroup.Item>
        <ToggleGroup.Item value="mobile" aria-label={t('messenger-preview-mobile', 'Phone')}>
          <IconDeviceMobile />
        </ToggleGroup.Item>
      </ToggleGroup>
      <iframe
        ref={frame}
        title={t('messenger-preview-frame', 'Messenger preview')}
        srcDoc={pageOf(messenger.previewUrl)}
        // Its own origin, so the widget reaches nothing of the page; the settings it shows are no secret.
        // The messenger's links open in a tab of their own, as they do on a website.
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className={`max-w-full rounded-lg border bg-muted ${DEVICES[device]}`}
      />
    </section>
  );
};
