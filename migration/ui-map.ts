// What the old UI's imports and GraphQL operations become in the new UI.
// `pnpm migrate:ui` reads it. A module port adds the rows it needs: an import
// the codemod reported, or an operation once its procedure exists.

export type ImportRow =
  /** Import `name` (default: the same name) from `from` instead. */
  | { from: string; name?: string; note?: string }
  /** Nothing replaces it; the note says what to do instead. */
  | { gone: string };

const BRANDS = { gone: 'the new core has no brands; leave brand ids and pickers out' };

const STRUCTURE = {
  gone: "core has no departments or branches; use the plugin's own teams (migration/core-map.ts)",
};

const PERMISSION = {
  gone: 'the API answers what the member may do (`canCreate`, `canManage`); render from that',
};

/** Rows by the old module specifier, then the old name. Names not listed keep their module when erxes-ui 4.x still exports them. */
export const IMPORTS: Record<string, Record<string, ImportRow>> = {
  'ui-modules': {
    SelectMember: { from: 'erxes-ui', note: 'SelectMember.Field and InlineCell take `members`' },
    MembersInline: {
      from: 'erxes-ui',
      name: 'MemberInline',
      note: 'one member: `memberId` plus `members`; render one per id',
    },
    IUser: {
      from: 'erxes-ui',
      name: 'Member',
      note: '`id`, `fullName`, `avatarUrl`, no `details`',
    },
    PageHeader: { from: 'erxes-ui' },
    SettingsHeader: { gone: 'use PageHeader with a Breadcrumb' },
    currentUserState: {
      gone: 'the plugin never holds the member; the API knows who calls and answers what they may do',
    },
    Can: PERMISSION,
    usePermissionCheck: PERMISSION,
    SelectBrand: BRANDS,
    SelectBrands: BRANDS,
    useBrands: BRANDS,
    useBrandsAdd: BRANDS,
    SelectDepartments: STRUCTURE,
    SelectBranches: STRUCTURE,
    DepartmentsInline: STRUCTURE,
    BranchesInline: STRUCTURE,
    SegmentsFilter: {
      gone: 'the new core has no segments; filter with Filter over your own query',
    },
  },
  'erxes-ui': {
    useQueryState: {
      from: 'nuqs',
      note: 'nuqs takes a parser: `useQueryState(key, parseAsString)`',
    },
    useMultiQueryState: { from: 'nuqs', name: 'useQueryStates', note: 'takes parsers by key' },
    isDefined: { gone: 'test `!isUndefinedOrNull(x)` from erxes-ui, or narrow with zod' },
    REACT_APP_API_URL: { gone: "call the plugin's API through `orpc` (ui/src/orpc.ts)" },
    validateFetchMore: { gone: "page with the procedure's cursor and useInfiniteQuery" },
  },
};

export type OperationRow = {
  /** The procedure path, as in `orpc.channels.list`. */
  procedure: string;
  /** Where the old root field's value sits in the output; empty when it is the whole output. */
  data?: string;
};

/** Rows by the old GraphQL root field. Add one when the procedure lands. */
export const OPERATIONS: Record<string, OperationRow> = {
  getChannels: { procedure: 'channels.list', data: 'channels' },
  getMyChannels: { procedure: 'channels.list', data: 'channels' },
  getChannel: { procedure: 'channels.get' },
  getChannelMembers: { procedure: 'channels.get', data: 'members' },
  channelAdd: { procedure: 'channels.create' },
  channelUpdate: { procedure: 'channels.update' },
  channelRemove: { procedure: 'channels.remove' },
  channelAddMembers: { procedure: 'channels.addMember' },
  channelRemoveMember: { procedure: 'channels.removeMember' },
  channelRemoveMembers: { procedure: 'channels.removeMember' },
  channelUpdateMember: { procedure: 'channels.setRole' },
};
