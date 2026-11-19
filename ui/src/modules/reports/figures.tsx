import { PostLine } from './PostLine.tsx';
import { memberQueries } from '@erxes/core-contract/client';
import { memberName, useFormat, useMembersById } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { DayChart, Heatmap, PieChart, type SeriesVisual } from './Charts.tsx';
import type { Visual } from './period.ts';
import { BarList, type BarRow, MiniTable } from './Tile.tsx';

/** A table cell: text, a number, a member shown by name, or a post shown by its text. */
export type Cell =
  | string
  | number
  | { member: string | null }
  | { postId: string; conversationId: string };

type HeatCell = { weekday: number; hour: number; total: number; answered: number };

/**
 * What a report card counts, before it is drawn: counts by day per series, a count per row
 * (a source, a tag, a status), a table, or calls by weekday and hour. Each draws in the visuals
 * `VISUALS` gives its type, and downloads as CSV.
 */
export type Figures =
  | {
      type: 'series';
      days: ({ day: string } & Record<string, string | number>)[];
      config: Record<string, { label: string; color: string }>;
    }
  | { type: 'rows'; rows: BarRow[] }
  | { type: 'table'; heads: [string, ...string[]]; rows: { key: string; cells: Cell[] }[] }
  | { type: 'heatmap'; cells: HeatCell[] };

/** The visuals each kind of figures draws in, the first by default. */
export const VISUALS = {
  series: ['area', 'line', 'bar', 'table'],
  rows: ['bar', 'pie', 'table'],
  table: ['table'],
  heatmap: ['heatmap', 'table'],
} as const satisfies Record<Figures['type'], readonly Visual[]>;

const isSeriesVisual = (visual: Visual): visual is SeriesVisual =>
  visual === 'area' || visual === 'line' || visual === 'bar';

/** The members the figures' table names, to show and download by name. */
const membersOf = (figures: Figures | undefined) =>
  figures?.type === 'table'
    ? figures.rows.flatMap((row) =>
        row.cells.flatMap((cell) =>
          typeof cell === 'object' && 'member' in cell ? [cell.member] : [],
        ),
      )
    : [];

/** The figures as a header row and rows of text, as its table shows it and its CSV holds it. */
export const useFiguresTable = (figures: Figures | undefined) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const members = useMembersById(membersOf(figures), memberQueries);

  const text = (cell: Cell) => {
    if (typeof cell === 'number') return format.number(cell);

    if (typeof cell === 'string') return cell;

    if ('postId' in cell) return cell.postId;

    const member = cell.member ? members.get(cell.member) : undefined;

    return member ? memberName(member) : (cell.member ?? t('nobody', 'Nobody'));
  };

  return (): { heads: string[]; rows: string[][] } => {
    if (!figures) return { heads: [], rows: [] };

    switch (figures.type) {
      case 'series': {
        const keys = Object.keys(figures.config);

        return {
          heads: [t('day', 'Day'), ...keys.map((key) => figures.config[key]?.label ?? key)],
          rows: figures.days.map((day) => [day.day, ...keys.map((key) => text(day[key] ?? 0))]),
        };
      }

      case 'rows':
        return {
          heads: [t('name', 'Name'), t('count', 'Count')],
          rows: figures.rows.map((row) => [row.name, text(row.value)]),
        };
      case 'table':
        return { heads: figures.heads, rows: figures.rows.map((row) => row.cells.map(text)) };
      case 'heatmap':
        return {
          heads: [
            t('weekday', 'Weekday'),
            t('hour', 'Hour'),
            t('calls', 'Calls'),
            t('answered', 'Answered'),
          ],
          rows: figures.cells.map((cell) => [
            format.date(new Date(2024, 0, cell.weekday), 'EEEE'),
            `${cell.hour}:00`,
            text(cell.total),
            text(cell.answered),
          ]),
        };
    }
  };
};

/** A CSV cell: quoted when it holds a comma, quote or line break, its quotes doubled. */
const csvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** `name` without the characters a file name can't hold. */
const fileName = (name: string) => name.replaceAll(/[\\/:*?"<>|]/g, ' ').trim() || 'report';

/**
 * Saves `heads` and `rows` as `<name>.csv` in the browser's downloads: UTF-8 with a byte order
 * mark, so a spreadsheet opens Mongolian text as written.
 */
const downloadCsv = (name: string, heads: string[], rows: string[][]) => {
  const csv = [heads, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = `${fileName(name)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/** The file a card's table downloads as. */
export type TableFile = 'csv' | 'xlsx';

/** Saves `heads` and `rows` as `<name>.csv`, or as an Excel workbook with the heads in bold. */
export const saveTable = async (
  file: TableFile,
  name: string,
  heads: string[],
  rows: string[][],
) => {
  if (file === 'csv') return downloadCsv(name, heads, rows);

  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  await writeXlsxFile([
    heads.map((value) => ({ value, fontWeight: 'bold' as const })),
    ...rows.map((row) => row.map((value) => ({ value }))),
  ]).toFile(`${fileName(name)}.xlsx`);
};

/** The figures' cell in a table: a member by their line, a post by its text, the rest as text. */
const CellView = ({ cell, text }: { cell: Cell; text: string }) => {
  if (typeof cell !== 'object') return text;

  return 'member' in cell ? <MemberLine id={cell.member} /> : <PostLine {...cell} />;
};

/** The figures drawn as `visual`, or as its type's first when it can't take that one. */
export const FiguresView = ({
  figures,
  visual,
  empty,
}: {
  figures: Figures;
  visual: Visual;
  empty: string;
}) => {
  const table = useFiguresTable(figures)();

  const drawn: Visual = (VISUALS[figures.type] as readonly Visual[]).includes(visual)
    ? visual
    : VISUALS[figures.type][0];

  if (figures.type === 'series' && isSeriesVisual(drawn))
    return <DayChart days={figures.days} config={figures.config} empty={empty} visual={drawn} />;

  if (figures.type === 'rows' && drawn === 'bar')
    return <BarList rows={figures.rows} empty={empty} />;

  if (figures.type === 'rows' && drawn === 'pie')
    return <PieChart rows={figures.rows} empty={empty} />;

  if (figures.type === 'heatmap' && drawn === 'heatmap')
    return <Heatmap cells={figures.cells} empty={empty} />;

  const [lead = '', ...numbers] = table.heads;

  return (
    <MiniTable
      heads={[lead, ...numbers]}
      rows={table.rows.map((row, index) => {
        const [first = '', ...rest] = row;
        const cells = figures.type === 'table' ? figures.rows[index]?.cells : undefined;

        return {
          key: figures.type === 'table' ? (figures.rows[index]?.key ?? first) : `${index}`,
          lead: cells?.[0] === undefined ? first : <CellView cell={cells[0]} text={first} />,
          numbers: rest,
        };
      })}
      empty={empty}
    />
  );
};
