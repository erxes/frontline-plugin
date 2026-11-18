import {
  type Announcements,
  closestCenter,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';

/**
 * Where a row held by keyboard is. Each arrow lines the row's top up with the row above's top, or
 * its bottom with the row below's bottom, so it is over the row it lines up with. Measuring by
 * corners or centres instead keeps a tall row, such as a field with its settings open, over itself.
 */
const linedUp: CollisionDetection = ({ collisionRect, droppableRects, droppableContainers }) =>
  droppableContainers
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);

      if (!rect) return [];

      const top = Math.abs(rect.top - collisionRect.top);
      const bottom = Math.abs(rect.bottom - collisionRect.bottom);

      return [
        { id: container.id, data: { droppableContainer: container, value: Math.min(top, bottom) } },
      ];
    })
    .toSorted((a, b) => a.data.value - b.data.value);

/**
 * A list's rows dragged up and down by their handles: by pointer once it moves 4 px, landing by
 * `byPointer`, or by keyboard (Space, the arrows, Space). Spread it into `DndContext`. A screen
 * reader hears each row by `nameOf` its id rather than the id itself, and specs wait for the same
 * words.
 */
export const useListDrag = (
  nameOf: (id: UniqueIdentifier) => string,
  byPointer: CollisionDetection = closestCenter,
) => {
  const { t } = useTranslation('frontline');

  // A keyboard drag has no pointer.
  const collisionDetection: CollisionDetection = (args) =>
    args.pointerCoordinates ? byPointer(args) : linedUp(args);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('drag-start', 'Picked up {{item}}.', { item: nameOf(active.id) }),
    onDragOver: ({ active, over }) => {
      const item = nameOf(active.id);

      if (!over) return t('drag-over-none', '{{item}} is over no place to drop.', { item });

      // Over itself: where it started, or a row that moved it to another list on the way.
      if (over.id === active.id) return t('drag-over-itself', '{{item}} is held.', { item });

      return t('drag-over', '{{item}} is over {{target}}.', { item, target: nameOf(over.id) });
    },
    onDragEnd: ({ active, over }) => {
      const item = nameOf(active.id);

      return over && over.id !== active.id
        ? t('drag-end', '{{item}} dropped on {{target}}.', { item, target: nameOf(over.id) })
        : t('drag-end-none', '{{item}} dropped.', { item });
    },
    onDragCancel: ({ active }) =>
      t('drag-cancel', '{{item}} put back.', { item: nameOf(active.id) }),
  };

  return {
    sensors,
    collisionDetection,
    modifiers: [restrictToVerticalAxis],
    accessibility: {
      announcements,
      screenReaderInstructions: {
        draggable: t(
          'drag-help',
          'Press Space to pick it up, the arrow keys to move it, Space to drop it, or Escape to put it back.',
        ),
      },
    },
  };
};
