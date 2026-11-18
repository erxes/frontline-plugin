import { getI18n } from 'react-i18next';
import { PLUGIN } from '~/plugin.ts';

/**
 * The config's words, which core shows in the member's language: the English is the key. They
 * load with `./config`, as core shows them before any page or slot.
 */
export const addConfigText = () =>
  getI18n().addResourceBundle(
    'mn',
    PLUGIN,
    {
      frontline: 'Фронтлайн',
      Account: 'Бүртгэл',
      Article: 'Нийтлэл',
      Bot: 'Бот',
      Call: 'Дуудлага',
      Category: 'Ангилал',
      Channel: 'Суваг',
      Content: 'Агуулга',
      Conversation: 'Харилцан яриа',
      Domain: 'Домэйн',
      Form: 'Маягт',
      'Help center': 'Тусламжийн төв',
      Integration: 'Интеграц',
      Permissions: 'Эрх',
      Pipeline: 'Урсгал',
      Questions: 'Асуултууд',
      'Response template': 'Хариултын загвар',
      Results: 'Үр дүн',
      SLA: 'SLA',
      Submission: 'Илгээлт',
      Survey: 'Судалгаа',
      Ticket: 'Тикет',
      'Ticket statuses': 'Тикетийн төлөв',
      Tickets: 'Тикет',
      Topic: 'Сэдэв',
      'Ticket summary': 'Тикетийн тойм',
      'Created, resolved, open and overdue tickets':
        'Үүсгэсэн, шийдвэрлэсэн, нээлттэй, хугацаа хэтэрсэн тикет',
      'Tickets over time': 'Тикет хугацаагаар',
      'Tickets created and resolved each day': 'Өдөр бүр үүсгэсэн ба шийдвэрлэсэн тикет',
      'Tickets by status': 'Тикет төлөвөөр',
      'New tickets by the status they are in now, or by stage across pipelines':
        'Шинэ тикет одоогийн төлөвөөр, бүх урсгалаар бол үе шатаар',
      'Tickets by priority': 'Тикет зэрэглэлээр',
      'New tickets by priority': 'Шинэ тикет зэрэглэлээр',
      'Tickets by tag': 'Тикет шошгоор',
      'The tags on new tickets': 'Шинэ тикетийн шошго',
      'Ticket SLA': 'Тикетийн SLA',
      'First responses and resolutions met, missed and overdue':
        'Анхны хариулт ба шийдвэрлэлт биелсэн, хэтэрсэн, хугацаа хэтэрсэн',
      'Open tickets by assignee': 'Нээлттэй тикет хариуцагчаар',
      'Who holds the unresolved tickets now': 'Шийдвэрлэгдээгүй тикетийг одоо хэн хариуцаж байна',
      'Conversation summary': 'Харилцан ярианы тойм',
      'Started, resolved and open conversations, and response times':
        'Эхэлсэн, шийдвэрлэсэн, нээлттэй харилцан яриа ба хариулах хугацаа',
      'Conversations over time': 'Харилцан яриа хугацаагаар',
      'Conversations started and resolved each day':
        'Өдөр бүр эхэлсэн ба шийдвэрлэсэн харилцан яриа',
      'Conversations by source': 'Харилцан яриа эх сурвалжаар',
      'Conversations by the integration they came through': 'Харилцан яриа ирсэн интеграцаар',
      'Conversations by tag': 'Харилцан яриа шошгоор',
      'The tags on new conversations': 'Шинэ харилцан ярианы шошго',
      'Top responders': 'Шилдэг хариулагчид',
      'Members who replied to customers the most': 'Харилцагчдад хамгийн их хариулсан гишүүд',
      'Call summary': 'Дуудлагын тойм',
      'Calls answered and missed, service level, wait and talk time':
        'Хариулсан ба аваагүй дуудлага, үйлчилгээний түвшин, хүлээлт ба ярианы хугацаа',
      'Call volume': 'Дуудлагын тоо',
      'Incoming, outgoing and missed calls each day': 'Өдөр бүрийн ирсэн, гарсан, аваагүй дуудлага',
      'Calls by hour': 'Дуудлага цагаар',
      'When calls come, by weekday and hour': 'Дуудлага хэзээ ирдэг, гараг ба цагаар',
      'Top agents': 'Шилдэг операторууд',
      'Members who answered the most calls': 'Хамгийн олон дуудлагад хариулсан гишүүд',
      'Calls by queue': 'Дуудлага дарааллаар',
      'Each queue’s calls, answers, misses and wait':
        'Дараалал бүрийн дуудлага, хариулт, алдалт, хүлээлт',
      'Top numbers': 'Шилдэг дугаарууд',
      'The numbers that called or were called the most':
        'Хамгийн их залгасан эсвэл залгагдсан дугаарууд',
    },
    true,
    true,
  );
