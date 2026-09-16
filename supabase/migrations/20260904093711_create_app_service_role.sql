-- The Nest API's Postgres connection must NOT be the `postgres` superuser
-- (or the owner of these tables): Postgres RLS is silently bypassed by
-- superusers and table owners regardless of policies, which is why
-- cross-tenant isolation had no effect despite correct RLS policies and a
-- correctly-set app.current_user_id. apps/api/.env's DATABASE_URL must
-- connect as this role instead.

create role app_service with login password 'app_service_password';

grant connect on database postgres to app_service;
grant usage on schema public to app_service;
grant select, insert, update, delete on all tables in schema public to app_service;

-- So tables added by future migrations (created as the `postgres` superuser)
-- are automatically usable by app_service without a repeat grant here.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to app_service;
