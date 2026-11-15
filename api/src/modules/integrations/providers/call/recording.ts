import type { PluginJobDelivery } from '@erxes/core-contract';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { core } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { callLegs, calls } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { call, pbxOf } from './call.ts';
import { Cdr, isAnsweredLeg, recordingOf } from './cdr.ts';
import { downloadRecording, type Pbx, pbxAction } from './pbx.ts';
import { updateCall } from './record.ts';

const Payload = z.object({ callId: z.string() });

const RecordInfo = z.object({ recordfiles: z.string().default('') });

/**
 * Where the call's recording sits: as its CDR named it, else as the PBX finds it for the
 * answered leg, for a CDR sent before the recording was written.
 */
const recordingPath = async (pbx: Pbx, recordingFile: string | null, legs: unknown[]) => {
  if (recordingFile) return recordingFile;

  const answered = legs
    .map((leg) => Cdr.safeParse(leg).data)
    .find((leg) => leg && isAnsweredLeg(leg));

  if (!answered) return null;

  const { recordfiles } = await pbxAction(pbx, 'getRecordInfosByCall', RecordInfo, {
    id: answered.AcctId,
  });

  return recordingOf([{ ...answered, recordfiles }]);
};

/**
 * Copies an answered call's recording from its PBX to core's storage and puts it on the call. A
 * PBX that refuses throws, so core tries again; a call already holding its recording is left.
 */
export const copyRecording = async (job: PluginJobDelivery) => {
  const { callId } = Payload.parse(job.payload);

  const found = await withOrg(job.orgId, async (tx) => {
    const [row] = await tx
      .select({
        recording: calls.recording,
        recordingFile: calls.recordingFile,
        account: integrationAccounts,
      })
      .from(calls)
      .innerJoin(integrationAccounts, eq(integrationAccounts.id, calls.accountId))
      .where(eq(calls.id, callId));

    const legs = await tx
      .select({ cdr: callLegs.cdr })
      .from(callLegs)
      .where(eq(callLegs.callId, callId));

    return row && { ...row, legs: legs.map((leg) => leg.cdr) };
  });

  if (!found || found.recording || found.account.provider !== 'call') return;

  const pbx = pbxOf(call.open(found.account).account);
  const path = await recordingPath(pbx, found.recordingFile, found.legs);

  if (!path) return;

  const recording = await downloadRecording(pbx, path);

  const files = core.forOrg(job.orgId).files;

  const { file, upload } = await files.createUpload({
    name: recording.name,
    contentType: recording.contentType,
    size: recording.bytes.length,
  });

  const sent = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: recording.bytes,
  });

  if (!sent.ok) throw new Error(`Core's storage refused the recording: ${sent.status}`);

  const ready = await files.complete({ id: file.id });

  await updateCall(found.account, callId, () =>
    Promise.resolve({
      recording: { url: ready.url, name: ready.name, type: ready.contentType, size: ready.size },
      recordingFile: null,
    }),
  );
};
