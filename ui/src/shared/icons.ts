import type * as TablerIcons from 'erxes-ui/modules/icons/components/TablerIcons';

/**
 * A name in erxes-ui's icon set, the only names `IconComponent` and `IconPicker` draw; any other
 * name draws the `123` placeholder. erxes-ui types the prop as a string, so this is the check.
 */
export type IconName = keyof typeof TablerIcons;

/** The icon a channel shows until a member picks one. */
export const CHANNEL_ICON: IconName = 'IconInbox';

/** The icon a knowledge base category shows until a member picks one. */
export const CATEGORY_ICON: IconName = 'IconFolder';
