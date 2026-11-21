// The slots `frontline:integration` fills in core's side panel (`ui/src/config.tsx`), loaded together.
export { IntegrationNew as New } from './IntegrationNew.tsx';

export {
  IntegrationActions as Actions,
  IntegrationDetail as Detail,
  IntegrationTitle as Title,
} from './IntegrationPanel.tsx';

export { AgentTab as Bot } from '@/messenger/AgentTab.tsx';
