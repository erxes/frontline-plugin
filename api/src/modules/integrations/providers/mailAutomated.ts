/**
 * Whether a program sent the mail, not a person: an auto-reply, a mailing list's or a bulk mail.
 * An AI agent answers none of them, so two auto-replies can't answer each other. mailparser keeps
 * `List-Id`, `List-Unsubscribe` and the other list headers together as `list`.
 */
export const automated = (headers: Map<string, unknown>) => {
  const header = (name: string) => {
    const value = headers.get(name);

    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  };

  const submitted = header('auto-submitted');

  return (
    (submitted !== '' && submitted !== 'no') ||
    ['bulk', 'list', 'junk'].includes(header('precedence')) ||
    headers.has('list') ||
    headers.has('x-autoreply') ||
    headers.has('x-autorespond')
  );
};
