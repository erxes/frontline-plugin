import type { List, Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

/** Blocks as plain text, a blank line apart as paragraphs read, or `between` apart. */
const blocks = (nodes: Nodes[], between = '\n\n') => nodes.map(plain).filter(Boolean).join(between);

const inline = (nodes: Nodes[]) => nodes.map(plain).join('');

/** A list's items a line each, with its bullet or number, and an item's next lines under its text. */
const listText = (list: List) =>
  list.children
    .map((item, index) => {
      const marker = list.ordered ? `${(list.start ?? 1) + index}. ` : '• ';
      const text = blocks(item.children, item.spread ? '\n\n' : '\n');

      return marker + text.replaceAll('\n', `\n${' '.repeat(marker.length)}`);
    })
    .join('\n');

/** A link's text and its address, or one of them when they say the same. */
const linked = (text: string, url: string) => {
  if (!text) return url;

  return text === url || `mailto:${text}` === url ? text : `${text}: ${url}`;
};

/** A markdown node as the plain text it reads as. */
function plain(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
    case 'html':
      return node.value;
    case 'break':
      return '\n';
    case 'link':
      return linked(inline(node.children), node.url);
    case 'image':
      return linked(node.alt ?? '', node.url);
    case 'list':
      return listText(node);
    case 'thematicBreak':
    case 'definition':
      return '';
    case 'root':
    case 'blockquote':
      return blocks(node.children);
    default:
      return 'children' in node ? inline(node.children) : '';
  }
}

/**
 * A core agent's markdown answer as Messenger and Instagram show it, which is plain text: no
 * bold or italic markers, a list's items as lines that start with "• " or their number, a link as
 * its text and address, a heading as a line of its own, and code without its backticks.
 */
export const metaText = (markdown: string) => plain(fromMarkdown(markdown)).trim();
