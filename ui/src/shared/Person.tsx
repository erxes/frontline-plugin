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
  'group/chip inline-flex h-6 max-w-full items-center gap-1 rounded-sm bg-muted px-1 text-xs font-medium';

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

  if (loading) return <Skeleton radius="sm" className="h-6 w-24" />;

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
        className="size-3 flex-none text-muted-foreground opacity-0 group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100"
      />
    </button>
  );
};

/** A customer's title and picture, the title '' while core knows no name for them. */
const useCustomerFace = (id: string | null | undefined) =>
  useQuery({
    ...contactQueries.customer(id ?? ''),
    enabled: Boolean(id),
    select: (customer) => ({ title: customerTitle(customer), avatarUrl: customer.avatarUrl }),
  });

/**
 * The customer's name, else their email or phone, else "Visitor", and their picture; `found`
 * once core has them, so a visitor core has no record of can't be opened.
 */
export const useCustomer = (customerId: string | null | undefined) => {
  const { t } = useTranslation('frontline');
  const { data, isPending } = useCustomerFace(customerId);

  return {
    name: data?.title || t('visitor', 'Visitor'),
    avatarUrl: data?.avatarUrl,
    isPending: Boolean(customerId) && isPending,
    found: Boolean(data),
  };
};

type ContactProps = { contentId: string; placeholder?: string };

/** A contact's chip from its query: its title, else `placeholder`, else `unnamed`. */
const ContactFace = ({
  contentType,
  contentId,
  placeholder,
  unnamed,
  contact: { data, isPending, error },
}: ContactProps & {
  contentType: TContactContentType;
  unnamed: string;
  contact: {
    data?: { title: string; avatarUrl: string | null };
    isPending: boolean;
    error: Error | null;
  };
}) => (
  <PersonChip
    record={{ contentType, contentId }}
    name={error?.message || data?.title || placeholder || unnamed}
    avatarUrl={data?.avatarUrl}
    loading={isPending}
    failed={Boolean(error)}
  />
);

const CustomerChip = (props: ContactProps) => {
  const { t } = useTranslation('frontline');

  return (
    <ContactFace
      {...props}
      contentType="core:customer"
      unnamed={t('unnamed-customer', 'Unnamed customer')}
      contact={useCustomerFace(props.contentId)}
    />
  );
};

const CompanyChip = (props: ContactProps) => {
  const { t } = useTranslation('frontline');

  const contact = useQuery({
    ...contactQueries.company(props.contentId),
    select: (company) => ({ title: companyTitle(company), avatarUrl: company.avatarUrl }),
  });

  return (
    <ContactFace
      {...props}
      contentType="core:company"
      unnamed={t('unnamed-company', 'Unnamed company')}
      contact={contact}
    />
  );
};

/** A customer or company as a chip that opens them in core's side panel. */
export const ContactChip = ({
  contentType = 'core:customer',
  ...props
}: ContactProps & { contentType?: TContactContentType }) =>
  contentType === 'core:company' ? <CompanyChip {...props} /> : <CustomerChip {...props} />;

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

/** A member's avatar alone, `label` with their name on hover and for screen readers. */
export const MemberAvatar = ({
  id,
  label,
  size = 'sm',
}: {
  id: string;
  label: (name: string) => string;
  size?: AvatarProps['size'];
}) => {
  const { member, name } = useMember(id);

  if (!member) return null;

  return (
    <span title={label(name)} className="flex-none">
      {/* The label names them; the initials would only repeat it first. */}
      <span aria-hidden className="flex">
        <PersonAvatar name={name} src={member.avatarUrl} size={size} />
      </span>
      <span className="sr-only">{label(name)}</span>
    </span>
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

  if (!member) return <Skeleton className="h-4 w-24" />;

  return <PersonLine name={name} src={member.avatarUrl} size={size} />;
};
