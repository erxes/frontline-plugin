import { PluginTransfers } from '@erxes/core-contract';
import { verifyCoreTransfer } from '@erxes/plugin-sdk';
import express from 'express';
import { signedByCore } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { logger } from '#/logger.ts';
import { fail, verifiedBy } from '../fail.ts';
import { exportSubmissions, importSubmissions, SUBMISSION_COLUMNS } from './submissions.ts';
import { exportTickets, importTickets, TICKET_COLUMNS } from './tickets.ts';

/** What the plugin offers core's Import & export: each record type with its two halves. */
const TYPES = [
  {
    type: 'frontline:ticket',
    label: 'Tickets',
    columns: TICKET_COLUMNS,
    exports: exportTickets,
    imports: importTickets,
  },
  {
    type: 'frontline:form_submission',
    label: 'Form submissions',
    columns: SUBMISSION_COLUMNS,
    exports: exportSubmissions,
    imports: importSubmissions,
  },
] as const;

/** The manifest's `transfer`, with core's defaults filled in. */
export const TRANSFERS = PluginTransfers.parse(
  TYPES.map(({ type, label, columns }) => ({
    type,
    label,
    columns,
    exportPermission: PERMISSIONS.recordsExport,
    importPermission: PERMISSIONS.recordsImport,
  })),
);

/**
 * Core POSTs a page to export or a batch to import here, signed over the raw body, for the
 * member who started it in Contacts › Settings › Import & export.
 */
export const transferRoutes = () =>
  express.Router().post('/:kind', express.text({ type: '*/*', limit: '5mb' }), async (req, res) => {
    const body: unknown = req.body;

    const request = await verifiedBy(
      res,
      'transfer token',
      'Only core asks for transfers',
      async () => {
        const verified = await verifyCoreTransfer(
          req.headers.authorization,
          typeof body === 'string' ? body : '',
          signedByCore,
        );

        if (verified.kind !== req.params.kind)
          throw new Error('the request is not the one at this path');

        return verified;
      },
    );

    if (!request) return;

    const type = TYPES.find((one) => one.type === request.type);

    if (!type) {
      res.status(404).json({ message: `No record type ${request.type}` });

      return;
    }

    try {
      const answer =
        request.kind === 'export' ? await type.exports(request) : await type.imports(request);

      logger.info(
        {
          type: request.type,
          kind: request.kind,
          requestId: request.requestId,
          orgId: request.orgId,
          rows: answer.rows.length,
        },
        'transfer done',
      );
      res.json(answer);
    } catch (error) {
      fail(res, error, `${request.type} ${request.kind}`);
    }
  });
