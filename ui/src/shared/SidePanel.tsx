import { cn, Label, Sheet } from 'erxes-ui';
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

/**
 * A form field: its label, the control, and a hint under it. `id` is the
 * control's, for the label; a control that labels itself leaves it out.
 */
export const Field = ({
  id,
  label,
  hint,
  className,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn('flex flex-col gap-2', className)}>
    {id ? (
      <Label htmlFor={id} variant="plain">
        {label}
      </Label>
    ) : (
      <span className="text-sm font-medium">{label}</span>
    )}
    {children}
    {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
  </div>
);
