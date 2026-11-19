/** The app's own words, in English and in Mongolian as erxes web says them. */
const en = {
  open: 'Open Frontline',
  openPhone: 'Open phone',
  quit: 'Quit',
  changeServer: 'Change erxes address',
  startAtLogin: 'Start at login',
  connecting: 'Phone: connecting',
  ready: 'Phone: ready',
  offline: 'Phone: offline',
  incoming: 'Incoming call',
  calling: 'Calling',
  onCall: 'On a call',
  answer: 'Answer',
  decline: 'Decline',
  hangUp: 'Hang up',
  takeQueueCalls: 'Take queue calls, ext. {extension}',
  leaveTitle: 'You are on a call',
  leaveDetail: 'Leaving the page ends it.',
  stay: 'Stay',
  leave: 'Leave',
  notAddress: 'That is not a web address',
};

const mn: typeof en = {
  open: 'Frontline нээх',
  openPhone: 'Утас нээх',
  quit: 'Гарах',
  changeServer: 'erxes-ийн хаяг солих',
  startAtLogin: 'Компьютер асахад нээх',
  connecting: 'Утас: холбогдож байна',
  ready: 'Утас: бэлэн',
  offline: 'Утас: офлайн',
  incoming: 'Ирж буй дуудлага',
  calling: 'Залгаж байна',
  onCall: 'Ярьж байна',
  answer: 'Хариулах',
  decline: 'Татгалзах',
  hangUp: 'Таслах',
  takeQueueCalls: 'Дарааллын дуудлага авах, дотуур {extension}',
  leaveTitle: 'Та ярьж байна',
  leaveDetail: 'Хуудаснаас гарвал дуудлага тасарна.',
  stay: 'Үлдэх',
  leave: 'Гарах',
  notAddress: 'Энэ вэб хаяг биш байна',
};

/** The words in `language`, erxes's code for it such as `mn`; English for any other. */
export const textIn = (language: string) => (language.startsWith('mn') ? mn : en);
