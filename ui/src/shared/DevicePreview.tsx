import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from '@tabler/icons-react';
import { ToggleGroup } from 'erxes-ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

const WIDTHS = { desktop: 'max-w-full', tablet: 'max-w-md', mobile: 'max-w-xs' } as const;

type Device = keyof typeof WIDTHS;

const isDevice = (value: string | undefined): value is Device =>
  Object.keys(WIDTHS).some((device) => device === value);

/** A preview with Desktop, Tablet and Mobile switches, drawn at the chosen screen's width. */
export const DevicePreview = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation('frontline');
  const [device, setDevice] = useState<Device>('desktop');

  const devices = [
    { value: 'desktop', label: t('desktop', 'Desktop'), icon: IconDeviceDesktop },
    { value: 'tablet', label: t('tablet', 'Tablet'), icon: IconDeviceTablet },
    { value: 'mobile', label: t('mobile', 'Mobile'), icon: IconDeviceMobile },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        value={[device]}
        onValueChange={([value]) => {
          if (isDevice(value)) setDevice(value);
        }}
        size="sm"
        variant="outline"
        aria-label={t('preview-device', 'Preview on')}
        className="self-center"
      >
        {devices.map(({ value, label, icon: Icon }) => (
          <ToggleGroup.Item key={value} value={value} aria-label={label}>
            <Icon />
            {label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup>
      <div className={`mx-auto w-full ${WIDTHS[device]}`}>{children}</div>
    </div>
  );
};
