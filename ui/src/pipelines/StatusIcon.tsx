import {
  type Icon,
  IconCircle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDashedCheck,
  IconCircleDot,
  IconCircleX,
} from '@tabler/icons-react';

/** Each stage's icon, by `type`. */
const STAGE_ICONS: Record<number, Icon> = {
  1: IconCircle,
  2: IconCircleDot,
  3: IconCircleDashed,
  4: IconCircleCheck,
  5: IconCircleDashedCheck,
  6: IconCircleX,
};

/** The stage's icon, drawn in the status's own colour. */
export const StatusIcon = ({ type, color }: { type: number; color?: string }) => {
  const StageIcon = STAGE_ICONS[type] ?? IconCircle;

  return <StageIcon aria-hidden color={color} className="size-4 shrink-0 text-muted-foreground" />;
};
