import { memberQueries } from '@erxes/core-contract/client';
import { type AvatarProps, MemberInline } from 'erxes-ui';

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
