import { Sheet } from 'erxes-ui';
import type { ReactNode } from 'react';

/** A form beside the page; closing it calls `onClose`. */
export const SidePanel = ({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
    <Sheet.View className="sm:max-w-md">
      <Sheet.Header>
        <Sheet.Title>{title}</Sheet.Title>
        <Sheet.Description className="sr-only">{description}</Sheet.Description>
        <Sheet.Close />
      </Sheet.Header>
      <Sheet.Content>{children}</Sheet.Content>
    </Sheet.View>
  </Sheet>
);
