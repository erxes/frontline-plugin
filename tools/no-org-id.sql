-- The plugin's tables without org_id, each with the reason; tools/check-rls.sql
-- reads them. A tenant_key names the column the table's tenant policy keys on
-- (core_enable_tenant_rls's second argument). None yet:
--   insert into no_org_id (table_name, tenant_key, reason) values
--     ('frontline_currencies', null, 'One list for every organisation.');
insert into no_org_id (table_name, tenant_key, reason) values
  ('frontline_public_addresses', null, 'Finds the organisation of a signed-out request by the key or domain frontline issued.');
