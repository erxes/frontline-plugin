import { Navigate, useSearchParams } from 'react-router-dom';

/** The address that opens `id` of `contentType` in core's side panel; `new` drafts one. */
const panelSearch = (contentType: string, id: string) =>
  `?${new URLSearchParams({ panel: `/detail/${contentType}/${id}` }).toString()}`;

/**
 * The old plugin's links: `?<param>=<id>` opened a record's panel, `?createTopic=true` the new
 * topic's. Either becomes core's panel address, `id` naming what to open; null without one.
 */
export const OldLink = ({
  param,
  contentType,
  id = (value) => value,
}: {
  param: string;
  contentType: string;
  id?: (value: string) => string;
}) => {
  const value = useSearchParams()[0].get(param);

  return value ? <Navigate replace to={{ search: panelSearch(contentType, id(value)) }} /> : null;
};
