// The slots surveys fill in core's side panel (`ui/src/config.tsx`), in one module so they load
// together.
import { SurveyActions, SurveyDetail, SurveyTitleSlot } from './SurveyPanel.tsx';
import { SurveyNew } from './SurveyNew.tsx';
import { SurveyPreview } from './SurveyPreview.tsx';
import { SurveyQuestions, SurveyResults } from './SurveyQuestions.tsx';

export const SurveySlots = {
  Title: SurveyTitleSlot,
  Actions: SurveyActions,
  Detail: SurveyDetail,
  New: SurveyNew,
};

export { SurveyPreview, SurveyQuestions, SurveyResults };
