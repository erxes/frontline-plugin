import { contactQueries, orpc as core } from '@erxes/core-contract/client';
import {
  IconBuilding,
  IconBuildingStore,
  IconEye,
  IconPencil,
  IconSitemap,
  IconTag,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Button,
  companyTitle,
  ContactLink,
  customerTitle,
  EntityPicker,
  PanelField,
  PanelSection,
  Popover,
  type TContactContentType,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { Badges, MembersField, PickerField } from '~/shared/Pickers.tsx';
import { type Ticket, useEditTicket } from './queries.ts';

/** The organisation's ticket tags, as erxes-ui's tag lookups take them. */
export const ticketTags = orpc.tags.list.queryOptions({ input: { type: 'ticket' } });

/** The organisation's departments or branches. */
export const useTeams = (kind: 'department' | 'branch') =>
  useQuery(orpc.teams.list.queryOptions({ input: { kind } })).data ?? [];

/** Who works the ticket beside its assignee, and who follows it. */
export const TicketPeople = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <PanelSection title={t('people', 'People')}>
      <PanelField icon={IconUsers} label={t('assigned-members', 'Assigned members')} cell={false}>
        <MembersField
          label={t('assigned-members', 'Assigned members')}
          value={ticket.assignedMemberIds}
          onValueChange={(assignedMemberIds) => edit({ assignedMemberIds })}
        />
      </PanelField>
      <PanelField icon={IconEye} label={t('followers', 'Followers')} cell={false}>
        <MembersField
          label={t('followers', 'Followers')}
          value={ticket.subscribedUserIds}
          onValueChange={(subscribedUserIds) => edit({ subscribedUserIds })}
        />
      </PanelField>
    </PanelSection>
  );
};

/** Core's customers or companies matching a search, as picker options. */
const useContactOptions = (contentType: TContactContentType, search: string) => {
  const customers = useQuery({
    ...core.customers.list.queryOptions({ input: { search: search || undefined, limit: 20 } }),
    enabled: contentType === 'core:customer',
    placeholderData: keepPreviousData,
  });

  const companies = useQuery({
    ...core.companies.list.queryOptions({ input: { search: search || undefined, limit: 20 } }),
    enabled: contentType === 'core:company',
    placeholderData: keepPreviousData,
  });

  return contentType === 'core:customer'
    ? {
        options: (customers.data?.data ?? []).map((row) => ({
          value: row.id,
          label: customerTitle(row),
        })),
        loading: customers.isPending,
        error: customers.error,
      }
    : {
        options: (companies.data?.data ?? []).map((row) => ({
          value: row.id,
          label: companyTitle(row),
        })),
        loading: companies.isPending,
        error: companies.error,
      };
};

/**
 * A customer or company of the ticket: core's link that opens it beside the page, and a button
 * that picks another from core's list.
 */
const ContactField = ({
  contentType,
  label,
  value,
  onChange,
}: {
  contentType: TContactContentType;
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const contacts = useContactOptions(contentType, search);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 px-2">
      {value ? (
        <ContactLink contentType={contentType} contentId={value} contacts={contactQueries} />
      ) : (
        <span className="truncate text-xs text-muted-foreground">{t('none', 'None')}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label={t('change-field', 'Change {{field}}', { field: label })}
            />
          }
        >
          <IconPencil />
        </Popover.Trigger>
        <Popover.Content align="end">
          <EntityPicker
            items={contacts.options}
            itemKey={(option) => ({ id: option.value, label: option.label })}
            value={value ? [value] : []}
            onValueChange={([id]) => {
              onChange(id ?? null);
              setOpen(false);
            }}
            noneLabel={t('none', 'None')}
            loading={contacts.loading}
            error={contacts.error}
            onSearchChange={setSearch}
            searchPlaceholder={label}
          />
        </Popover.Content>
      </Popover>
    </span>
  );
};

/** The customer and company the ticket is about, from core. */
export const TicketContacts = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <PanelSection title={t('contacts', 'Contacts')}>
      <PanelField icon={IconUserCircle} label={t('customer', 'Customer')} cell={false}>
        <ContactField
          contentType="core:customer"
          label={t('customer', 'Customer')}
          value={ticket.customerId}
          onChange={(customerId) => edit({ customerId })}
        />
      </PanelField>
      <PanelField icon={IconBuilding} label={t('company', 'Company')} cell={false}>
        <ContactField
          contentType="core:company"
          label={t('company', 'Company')}
          value={ticket.companyId}
          onChange={(companyId) => edit({ companyId })}
        />
      </PanelField>
    </PanelSection>
  );
};

/** A department or branch picked in place. */
const TeamField = ({
  kind,
  label,
  value,
  onChange,
}: {
  kind: 'department' | 'branch';
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const teams = useTeams(kind);

  return (
    <PickerField
      label={label}
      placeholder={t('none', 'None')}
      display={<span className="truncate">{teams.find((team) => team.id === value)?.name}</span>}
      options={teams.map((team) => ({ value: team.id, label: team.name }))}
      value={value ? [value] : []}
      onValueChange={([id]) => onChange(id ?? null)}
      noneLabel={t('none', 'None')}
    />
  );
};

/** The ticket's tags, picked in place. */
export const TagsField = ({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const tags = useQuery(ticketTags);
  const rows = tags.data?.data ?? [];
  const name = new Map(rows.map((tag) => [tag.id, tag.name]));

  return (
    <PickerField
      label={t('tags', 'Tags')}
      placeholder={t('no-tags', 'No tags')}
      display={<Badges labels={value.map((id) => name.get(id) ?? '')} />}
      options={rows.map((tag) => ({ value: tag.id, label: tag.name }))}
      loading={tags.isPending}
      error={tags.error}
      value={value}
      onValueChange={onChange}
      multiple
    />
  );
};

/** Its tags, branch and department. */
export const TicketLabels = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <PanelSection title={t('labels', 'Labels')}>
      <PanelField icon={IconTag} label={t('tags', 'Tags')} cell={false}>
        <TagsField value={ticket.tagIds} onChange={(tagIds) => edit({ tagIds })} />
      </PanelField>
      <PanelField icon={IconBuildingStore} label={t('branch', 'Branch')} cell={false}>
        <TeamField
          kind="branch"
          label={t('branch', 'Branch')}
          value={ticket.branchId}
          onChange={(branchId) => edit({ branchId })}
        />
      </PanelField>
      <PanelField icon={IconSitemap} label={t('department', 'Department')} cell={false}>
        <TeamField
          kind="department"
          label={t('department', 'Department')}
          value={ticket.departmentId}
          onChange={(departmentId) => edit({ departmentId })}
        />
      </PanelField>
    </PanelSection>
  );
};
