import {
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useListDrag } from '~/shared/drag.ts';
import { type FormField, useArrangeFields } from './useForms.ts';

/** Each step's field ids in order; step `n` is at `n - 1`. */
type Layout = string[][];

/** A step's drop zone, so a step with no fields takes one too. */
export const stepZone = (pageNumber: number) => `step:${pageNumber}`;

const layoutOf = (fields: FormField[], steps: number): Layout =>
  Array.from({ length: steps }, (_, index) =>
    fields.filter((field) => field.pageNumber === index + 1).map((field) => field.id),
  );

/** The step a field or a step's zone is on, or -1. */
const stepOf = (layout: Layout, id: UniqueIdentifier) => {
  const zone = layout.findIndex((_, index) => stepZone(index + 1) === id);

  return zone === -1 ? layout.findIndex((ids) => ids.includes(String(id))) : zone;
};

/** `layout` with the field `id` taken off its step and put on step `to`, before `over`. */
const moved = (layout: Layout, id: string, to: number, over: UniqueIdentifier) =>
  layout.map((ids, index) => {
    if (index !== to) return ids.filter((each) => each !== id);

    const at = ids.indexOf(String(over));

    return ids.toSpliced(at === -1 ? ids.length : at, 0, id);
  });

/**
 * Dragging fields within a step and across steps. A drag starts from the layout on screen, and
 * while a field is held the layout follows the pointer from step to step. On drop, the step it
 * lands on saves its new order, and the layout holds until the fields show it, so nothing jumps
 * back for a frame, nor for a second drag started before the save's update lands.
 */
export const useFieldDrag = (formId: string, fields: FormField[], steps: number) => {
  const arrange = useArrangeFields(formId);
  const [dropped, setDropped] = useState<{ fields: FormField[]; layout: Layout } | null>(null);
  const [held, setHeld] = useState<Layout | null>(null);
  const shown = dropped?.fields === fields ? dropped.layout : layoutOf(fields, steps);
  const layout = held ?? shown;
  const { t } = useTranslation('frontline');

  const drag = useListDrag((id) => {
    const zone = layout.findIndex((_, index) => stepZone(index + 1) === id);

    return zone === -1
      ? fields.find((field) => field.id === id)?.label || t('field-untitled', 'Untitled field')
      : t('form-step-n', 'Step {{n}}', { n: zone + 1 });
  }, closestCorners);

  const dragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    setHeld((current) => {
      if (!current) return current;

      const from = stepOf(current, active.id);
      const to = stepOf(current, over.id);

      if (from === -1 || to === -1 || from === to) return current;

      return moved(current, String(active.id), to, over.id);
    });
  };

  const dragEnd = ({ active, over }: DragEndEvent) => {
    const to = over ? stepOf(layout, over.id) : -1;
    const ids = layout[to];

    setHeld(null);

    if (!over || !ids) return;

    const at = ids.indexOf(String(over.id));
    const next = at === -1 ? ids : arrayMove(ids, ids.indexOf(String(active.id)), at);

    if (next.join() === shown[to]?.join()) return;

    setDropped({ fields, layout: layout.with(to, next) });
    arrange(to + 1, next);
  };

  return {
    layout,
    context: {
      ...drag,
      onDragStart: () => setHeld(shown),
      onDragOver: dragOver,
      onDragEnd: dragEnd,
      onDragCancel: () => setHeld(null),
    },
  };
};
