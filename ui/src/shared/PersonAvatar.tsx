import { contactQueries } from '@erxes/core-contract/client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, type AvatarProps, cn, customerTitle } from 'erxes-ui';
import { useTranslation } from 'react-i18next';

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

/**
 * A person's picture, else their initials in a tint of their own, so a list of people reads as
 * people rather than a column of grey letters.
 */
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
  <Avatar size={size} className={className}>
    {src && <Avatar.Image src={src} alt="" />}
    <Avatar.Fallback>
      <span className={cn('grid size-full place-items-center', tintOf(name))}>
        {initialsOf(name)}
      </span>
    </Avatar.Fallback>
  </Avatar>
);

/** The customer's name, else their email or phone, else "Visitor", and their picture. */
export const useCustomer = (customerId: string | null | undefined) => {
  const { t } = useTranslation('frontline');

  const { data } = useQuery({
    ...contactQueries.customer(customerId ?? ''),
    enabled: Boolean(customerId),
  });

  return {
    name: (data && customerTitle(data)) || t('visitor', 'Visitor'),
    avatarUrl: data?.avatarUrl,
  };
};
