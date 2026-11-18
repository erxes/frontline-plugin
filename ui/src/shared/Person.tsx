import { contactQueries, memberQueries } from '@erxes/core-contract/client';
import { IconArrowUpRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  type AvatarProps,
  cn,
  companyTitle,
  customerTitle,
  MEMBER_CONTENT_TYPE,
  memberName,
  readImage,
  type RecordRef,
  Skeleton,
  type TContactContentType,
  useMembersById,
  useOpenRecord,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Every person in frontline, customer or member, is drawn from this file: erxes-ui's own
// avatars (`ContactLink`, `MemberLink`, `MemberInline`) fall back to one grey letter, so a list
// of people reads as a column of the same grey circle.

/**
 * The theme's text tints for a fallback avatar's initials, one picked per name; the integration
 * icons use the same ones, so they add nothing to the stylesheet.
 */
const TINTS = [
  'text-primary-text',
  'text-info-text',
  'text-success-text',
  'text-warning-text',
  'text-destructive-text',
];

/** The same name always gets the same tint. */
const tintOf = (name: string) => {
  let sum = 0;

  for (let index = 0; index < name.length; index++) sum += name.charCodeAt(index);

  return TINTS[sum % TINTS.length];
};

/** Up to two initials: "Bolormaa Ganbaatar" reads "BG". */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('');

/** A person's picture, else their initials in a tint of their own. */
export const PersonAvatar = ({
  name,
  src,
  size = 'xl',
  className,
}: {
  name: string;
  src?: string | null;
  size?: AvatarProps['size'];
  className?: string;
}) => (
  <Avatar size={size} className={cn('flex-none', className)}>
    {src && <Avatar.Image src={readImage(src)} alt="" />}
    <Avatar.Fallback>
      <span className={cn('grid size-full place-items-center', tintOf(name))}>
        {initialsOf(name)}
      </span>
    </Avatar.Fallback>
  </Avatar>
);

/** A person's avatar and name on one line, in a row's small text. */
export const PersonLine = ({
  name,
  src,
  size = 'lg',
  children,
}: {
  name: string;
  src?: string | null;
  size?: AvatarProps['size'];
  children?: ReactNode;
}) => (
  <span className="flex min-w-0 items-center gap-2 text-xs">
    <PersonAvatar name={name} src={src} size={size} />
    <span className="truncate">{name}</span>
    {children}
  </span>
);

const CHIP =
  'group/chip inline-flex h-6 max-w-full items-center gap-1 rounded-sm bg-muted px-1.5 text-xs font-medium';

/**
 * A person as a chip: avatar and name. Inside erxes a click opens them in core's side panel
 * beside the page, as erxes-ui's `RecordChip` does; elsewhere it is only the name.
 */
const PersonChip = ({
  record,
  name,
  avatarUrl,
  loading,
  failed,
}: {
  record: RecordRef;
  name: string;
  avatarUrl?: string | null;
  loading: boolean;
  failed?: boolean;
}) => {
  const { open, canOpen } = useOpenRecord();

  if (loading) return <Skeleton radius="sm" className="h-5 w-20" />;

  const face = (
    <>
      <PersonAvatar name={name} src={avatarUrl} size="sm" className="size-4" />
      <span className={cn('truncate', failed && 'text-destructive')}>{name}</span>
    </>
  );

  if (!canOpen)
    return (
      <span title={name} className={CHIP}>
        {face}
      </span>
    );

  return (
    <button
      type="button"
      onClick={() => open(record)}
      title={name}
      data-panel-inline=""
      className={cn(
        CHIP,
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {face}
      <IconArrowUpRight
        aria-hidden="true"
        className="size-3 flex-none text-muted-foreground opacity-0 transition-opacity group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100"
      />
    </button>
  );
};

/** A customer's or company's title and picture, '' while core knows no name for them. */
const useContact = (contentType: TContactContentType, contentId: string | null | undefined) => {
  const customer = useQuery({
    ...contactQueries.customer(contentId ?? ''),
    enabled: contentType === 'core:customer' && Boolean(contentId),
  });

  const company = useQuery({
    ...contactQueries.company(contentId ?? ''),
    enabled: contentType === 'core:company' && Boolean(contentId),
  });

  if (contentType === 'core:customer')
    return {
      title: customer.data ? customerTitle(customer.data) : '',
      avatarUrl: customer.data?.avatarUrl,
      isPending: Boolean(contentId) && customer.isPending,
      error: customer.error,
    };

  return {
    title: company.data ? companyTitle(company.data) : '',
    avatarUrl: company.data?.avatarUrl,
    isPending: Boolean(contentId) && company.isPending,
    error: company.error,
  };
};

/** The customer's name, else their email or phone, else "Visitor", and their picture. */
export const useCustomer = (customerId: string | null | undefined) => {
  const { t } = useTranslation('frontline');
  const { title, avatarUrl, isPending } = useContact('core:customer', customerId);

  return { name: title || t('visitor', 'Visitor'), avatarUrl, isPending };
};

/** A customer or company as a chip that opens them in core's side panel. */
export const ContactChip = ({
  contentType = 'core:customer',
  contentId,
  placeholder,
}: {
  contentType?: TContactContentType;
  contentId: string;
  placeholder?: string;
}) => {
  const { t } = useTranslation('frontline');
  const contact = useContact(contentType, contentId);

  const name =
    contact.error?.message ||
    contact.title ||
    placeholder ||
    (contentType === 'core:customer'
      ? t('unnamed-customer', 'Unnamed customer')
      : t('unnamed-company', 'Unnamed company'));

  return (
    <PersonChip
      record={{ contentType, contentId }}
      name={name}
      avatarUrl={contact.avatarUrl}
      loading={contact.isPending}
      failed={Boolean(contact.error)}
    />
  );
};

/** A member by id, any status, and how they read. */
const useMember = (id: string | null | undefined) => {
  const member = useMembersById([id], memberQueries).get(id ?? '');

  return { member, name: member ? memberName(member) : '' };
};

/**
 * A member in a panel row: a chip that opens them in core's side panel. A row inside a button
 * (a card, a picker) uses `MemberLine`, since a chip there would be a button in a button.
 */
export const MemberChip = ({ id }: { id: string | null | undefined }) => {
  const { member, name } = useMember(id);

  if (!id) return null;

  return (
    <PersonChip
      record={{ contentType: MEMBER_CONTENT_TYPE, contentId: id }}
      name={name}
      avatarUrl={member?.avatarUrl}
      loading={!member}
    />
  );
};

/** A member's avatar and name on one line, or `placeholder` without one. */
export const MemberLine = ({
  id,
  size,
  placeholder,
}: {
  id: string | null | undefined;
  size?: AvatarProps['size'];
  placeholder?: string;
}) => {
  const { member, name } = useMember(id);

  if (!id) return <span className="truncate text-xs text-muted-foreground">{placeholder}</span>;

  if (!member) return <Skeleton className="h-4 w-20" />;

  return <PersonLine name={name} src={member.avatarUrl} size={size} />;
};
