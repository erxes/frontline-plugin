// The slots forms and their submissions fill in core's side panel (`ui/src/config.tsx`), in one
// module so they load together.
import { FormNew } from './FormNew.tsx';
import { FormActions, FormDetail, FormTitle } from './FormPanel.tsx';
import { SubmissionActions, SubmissionDetail, SubmissionTitle } from './SubmissionPanel.tsx';

export const FormSlots = {
  Title: FormTitle,
  Actions: FormActions,
  Detail: FormDetail,
  New: FormNew,
};

export const SubmissionSlots = {
  Title: SubmissionTitle,
  Actions: SubmissionActions,
  Detail: SubmissionDetail,
};
