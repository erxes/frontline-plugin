// One source collection read and turned into rows. Steps run in order, so a later one finds the
// rows an earlier one gave (`Context.known`).
import type { Document } from 'mongodb';
import type { Context } from './context.ts';
import type { Outcome } from './engine.ts';
import { idOf } from './values.ts';

type Documents = AsyncIterable<Document> | Iterable<Document>;

export type Step = {
  /** `<database>.<collection>`, as the report and `--only` name it. */
  source: string;
  documents: (ctx: Context) => Documents | Promise<Documents>;
  transform: (document: Document, ctx: Context) => Outcome | Promise<Outcome>;
};

/** A collection this importer leaves out as a whole, and why. */
export type LeftOut = { source: string; reason: string };

/** The id a report names a document by. */
const reportId = ({ _id: id }: Document) => idOf(id) ?? JSON.stringify(id);

export const runStep = async (ctx: Context, step: Step) => {
  const { report, writer } = ctx;

  report.of(step.source);

  for await (const document of await step.documents(ctx)) {
    report.seen(step.source);

    const outcome = await step.transform(document, ctx);
    const id = reportId(document);

    if ('skip' in outcome) report.skipped(step.source, id, outcome.skip);
    else await writer.add(step.source, id, outcome.puts);
  }

  await writer.flush();
};
