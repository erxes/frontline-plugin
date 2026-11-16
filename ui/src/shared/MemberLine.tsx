import { memberQueries } from '@erxes/core-contract/client';
import { type AvatarProps, MemberInline, MemberLink } from 'erxes-ui';

/**
 * A member in a panel row: a chip that opens them in core's side panel. A row inside a button
 * (a card, a picker) uses `MemberLine`, since a chip there would be a button in a button.
 */
export const MemberChip = ({ id }: { id: string | null | undefined }) =>
  id ? <MemberLink memberId={id} members={memberQueries} /> : null;

/**
 * A member's avatar and name on one line in a row's small text, anywhere but a table cell.
 * erxes-ui's `MemberInline` returns the two bare, so outside a cell its parent splits them
 * (erxes/erxes#10598).
 */
export const MemberLine = ({
  id,
  size,
}: {
  id: string | null | undefined;
  size?: AvatarProps['size'];
}) => (
  <span className="flex min-w-0 items-center gap-2 text-xs">
    <MemberInline memberId={id} members={memberQueries} size={size} />
  </span>
);
