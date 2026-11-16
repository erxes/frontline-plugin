import { randomUUID } from 'node:crypto';
import { JOBS } from '#/core.ts';
import { JOB_RUNS } from '#/jobs.ts';
import { coreUnits, type UnitInput } from './coreUnits.ts';

/** Runs the units job for the organisation, as core does on install and nightly. */
export const runUnitsJob = async (orgId: string) => {
  const run = JOB_RUNS[JOBS.units.name];

  if (!run) throw new Error(`No job ${JOBS.units.name}`);

  return run({
    jobId: `job-${randomUUID()}`,
    orgId,
    name: JOBS.units.name,
    attempt: 1,
    payload: {},
  });
};

/**
 * Adds a branch or department in core, as an admin does at Settings › Structure, and lets
 * frontline's copy catch up. Needs `vi.mock('#/core.ts', …unitsStandIn)`.
 */
export const addUnit = async (orgId: string, unit: Omit<UnitInput, 'id'> & { id?: string }) => {
  const added = { id: randomUUID(), ...unit };

  coreUnits.put(orgId, added);
  await runUnitsJob(orgId);

  return added;
};

/** Deletes a unit in core and lets frontline's copy catch up. */
export const removeUnit = async (orgId: string, id: string) => {
  coreUnits.remove(orgId, id);
  await runUnitsJob(orgId);
};
