// What a run did per source collection: documents seen, rows copied or already there, and each
// reason a document or row was left out, with up to 5 example ids.
const EXAMPLES = 5;

type Reason = { count: number; examples: string[] };

export type SourceReport = {
  seen: number;
  /** Rows inserted, per target table. */
  copied: Record<string, number>;
  /** Rows the target already had (a second run), per target table. */
  existing: Record<string, number>;
  skipped: number;
  reasons: Record<string, Reason>;
  /** Why a collection is left out as a whole, or what else to know about it. */
  note?: string;
};

const blank = (): SourceReport => ({ seen: 0, copied: {}, existing: {}, skipped: 0, reasons: {} });

const sum = (counts: Record<string, number>) =>
  Object.values(counts).reduce((total, count) => total + count, 0);

export class Report {
  readonly sources = new Map<string, SourceReport>();

  of(source: string) {
    const found = this.sources.get(source);

    if (found) return found;

    const made = blank();

    this.sources.set(source, made);

    return made;
  }

  seen(source: string) {
    this.of(source).seen += 1;
  }

  skipped(source: string, id: string, reason: string) {
    const report = this.of(source);
    const entry = report.reasons[reason] ?? { count: 0, examples: [] };

    report.skipped += 1;
    entry.count += 1;

    if (entry.examples.length < EXAMPLES) entry.examples.push(id);

    report.reasons[reason] = entry;
  }

  refused(source: string, table: string, id: string, reason: string) {
    this.skipped(source, id, `${table}: ${reason}`);
  }

  inserted(source: string, table: string, rows: number, inserted: number) {
    const { copied, existing } = this.of(source);

    copied[table] = (copied[table] ?? 0) + inserted;
    existing[table] = (existing[table] ?? 0) + rows - inserted;
  }

  /** A collection left out as a whole: counted as seen and skipped for its reason. */
  leftOut(source: string, count: number, reason: string) {
    const report = this.of(source);

    report.seen += count;
    report.skipped += count;
    report.note = reason;
  }

  note(source: string, text: string) {
    const report = this.of(source);

    report.note = report.note ? `${report.note}; ${text}` : text;
  }

  copiedTotal() {
    return [...this.sources.values()].reduce((total, report) => total + sum(report.copied), 0);
  }

  /** Rows every source inserted into `table`. */
  copiedInto(table: string) {
    return [...this.sources.values()].reduce(
      (total, report) => total + (report.copied[table] ?? 0),
      0,
    );
  }

  toJSON() {
    return Object.fromEntries(this.sources);
  }

  /** One line per source: seen, copied, already there and skipped, then each skip reason. */
  lines() {
    const width = Math.max(...[...this.sources.keys()].map((source) => source.length), 10);

    const header = `${'source'.padEnd(width)}  ${'seen'.padStart(8)} ${'copied'.padStart(8)} ${'existing'.padStart(8)} ${'skipped'.padStart(8)}`;

    return [
      header,
      ...[...this.sources].flatMap(([source, report]) => this.#lines(source, report, width)),
    ];
  }

  #lines(source: string, report: SourceReport, width: number) {
    const row = `${source.padEnd(width)}  ${String(report.seen).padStart(8)} ${String(sum(report.copied)).padStart(8)} ${String(sum(report.existing)).padStart(8)} ${String(report.skipped).padStart(8)}`;

    return [
      row,
      ...(report.note ? [`    note: ${report.note}`] : []),
      ...Object.entries(report.reasons).map(
        ([reason, { count, examples }]) => `    ${count} × ${reason} (${examples.join(', ')})`,
      ),
    ];
  }
}
