import type { PluginAssistantSkill } from '@erxes/core-contract';
import type { z } from 'zod';

type Skill = z.input<typeof PluginAssistantSkill>;

export const ASSISTANT_SKILLS = [
  {
    name: 'reports',
    description:
      'Count and time conversations, tickets, calls or Facebook and Instagram activity over a period',
    instructions: `1. Settle the period first. Ask when the member gives none. A report covers at most 366 days.
2. Send \`from\` and \`to\` as ISO date-times with the member's UTC offset, and \`timeZone\` as their IANA name (\`Asia/Ulaanbaatar\`). \`to\` is exclusive: October is \`2026-10-01T00:00:00+08:00\` to \`2026-11-01T00:00:00+08:00\`. A bare date is UTC midnight.
3. Pick the report:
   - conversations started, resolved, reply and resolution times, sources, tags, members: \`frontline:reports.conversations\`
   - tickets created and resolved, by status, priority, tag, assignee and SLA: \`frontline:reports.tickets\`; by a custom field's values: \`frontline:reports.ticketProperties\` with its \`fieldId\`. Status ids get their names from \`frontline:pipelines.choices\`
   - calls: \`frontline:reports.calls\`
   - Facebook and Instagram messages, comments and top posts: \`frontline:reports.meta\`
4. Times come back in seconds: say them as minutes or hours. Counts cover only the channels the member sees.`,
  },
  {
    name: 'file-ticket',
    description: 'Create a ticket in the right channel, pipeline and status, or move one along',
    instructions: `1. \`frontline:pipelines.choices\` lists every pipeline the member sees and its statuses, with \`canEdit\` and \`canMove\`. Match the member's words to one pipeline; ask when two fit.
2. Leave \`statusId\` out to file in the pipeline's first status, or pick one of that pipeline's statuses.
3. \`frontline:tickets.create\` with \`pipelineId\` and \`name\`. Add \`customerId\` or \`conversationId\` when the ticket comes from a customer or a conversation, and \`assigneeId\` (a team member's user id) only when the member names one. Assignees are notified.
4. A refusal for a required custom field names the field: ask the member for its value and send it in \`propertiesData\`.
5. To find a ticket, \`frontline:tickets.list\` with \`search\` (name or number). To move one, \`frontline:tickets.update\` with its \`id\` and the new \`statusId\`.`,
  },
  {
    name: 'answer-conversation',
    description:
      'Find a customer conversation in the inbox, reply or note, then assign or resolve it',
    instructions: `1. \`frontline:conversations.list\` with \`search\` (message text, or the customer's name, email or phone). Resolved conversations show only when the filter asks for a status.
2. Read the thread with \`frontline:conversations.messages.list\` before you write.
3. A reply goes to the customer the moment it is sent. Show the member the text and wait for their OK. A note for colleagues is \`internal: true\`, which the customer never sees.
4. Send with \`frontline:conversations.messages.create\` (\`conversationId\`, \`content\`). The channel's saved replies are in \`frontline:responseTemplates.list\`.
5. \`frontline:conversations.assign\` hands conversations to a member (\`assigneeId\`, or null to unassign). \`frontline:conversations.setStatus\` sets \`new\`, \`open\` or \`resolved\`.`,
  },
  {
    name: 'knowledge-base',
    description:
      'Write a knowledge base article under the right topic and category, as a draft or published',
    instructions: `1. Articles sit in a category, and categories in a topic. \`frontline:knowledgebase.topics.list\`, then \`frontline:knowledgebase.categories.list\` for that topic. Create a topic or category only when the member asks.
2. \`frontline:knowledgebase.articles.list\` for the topic with \`search\` first, drafts included, so you update an article that already covers it rather than writing a second one.
3. \`frontline:knowledgebase.articles.create\` with \`categoryId\` and \`title\`. It starts as a draft. \`status: 'publish'\` shows it in help centers now, and \`'scheduled'\` with \`scheduledAt\` shows it later. Publish only when the member says so.`,
  },
] satisfies Skill[];
