/**
 * The Mailbox tile's mark: an inbox tray on an amber badge, in the theme's colours. A mailbox
 * is any IMAP and SMTP account, so there is no brand logo; it matches the Mail service tiles.
 */
export const MailboxLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <rect width="24" height="24" rx="5" fill="var(--color-warning)" />
    <g
      fill="none"
      stroke="var(--color-primary-foreground)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13.2 7 7.4c.2-.6.8-1 1.4-1h7.2c.6 0 1.2.4 1.4 1l2 5.8V16c0 .9-.7 1.6-1.6 1.6H6.6c-.9 0-1.6-.7-1.6-1.6z" />
      <path d="M5.2 13.2h3.6l1 1.8h4.4l1-1.8h3.6" />
    </g>
  </svg>
);
