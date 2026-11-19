/** A list or report filter, as the UI sends it: one rule keeping the rows whose `path` is `id`. */
export const only = (path: string, id: string) =>
  JSON.stringify({ match: 'all', rules: [{ path, op: 'in', value: [id] }] });
