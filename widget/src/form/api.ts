import type { VisitorForm as FormReply } from '@frontline/api/forms';
import type { Jsonify } from 'type-fest';
import { publicApi, uploadFile } from '../shared/http.ts';

/** A form as the embed reads it, as JSON carries it. */
export type VisitorForm = Jsonify<FormReply>;

export type Field = VisitorForm['fields'][number];

/** An answer as the embed sends it; a file field's is the receipts of its uploads. */
export type Answer = string | number | boolean | string[];

/** A field the API refused, and what to fix. */
type FieldError = { fieldId: string; message: string };

const isFieldError = (item: unknown): item is FieldError =>
  typeof item === 'object' &&
  item !== null &&
  'fieldId' in item &&
  typeof item.fieldId === 'string' &&
  'message' in item &&
  typeof item.message === 'string';

/** The fields a refused submission names, from its answer. */
const errorsOf = (body: unknown) =>
  typeof body === 'object' && body && 'errors' in body && Array.isArray(body.errors)
    ? body.errors.filter(isFieldError)
    : [];

/** One form's signed-out API at `base`, `/api/public/<key>/forms/<code>`. */
export const formApi = (base: URL) => {
  const http = publicApi(base);

  return {
    form: () => http.get().json<VisitorForm>(),
    upload: (file: File) => uploadFile(http, '/files', file),
    /** Sends the answers: the submission, or the fields to fix. */
    submit: async (answers: Record<string, Answer>) => {
      try {
        const { submissionId } = await http.post({ answers }).json<{ submissionId: string }>();

        return { submissionId, errors: [] };
      } catch (failure) {
        if (
          failure instanceof Error &&
          'body' in failure &&
          'status' in failure &&
          failure.status === 422
        )
          return { submissionId: null, errors: errorsOf(failure.body) };

        throw failure;
      }
    },
  };
};

export type FormApi = ReturnType<typeof formApi>;
