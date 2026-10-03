-- Read-only inspection of the already-installed schema. This is NOT a migration.
-- Run in Supabase SQL Editor. Results contain schema metadata, not user data.
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object(
    'name', c.relname, 'rls_enabled', c.relrowsecurity,
    'anonymous_select', has_table_privilege('anon', c.oid, 'SELECT'),
    'authenticated_crud', (select bool_and(has_table_privilege('authenticated', c.oid, privilege))
      from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as privilege)
  ) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('profiles','skills','topics','study_sessions','study_plans')),
  'policies', (select jsonb_agg(jsonb_build_object(
    'table', tablename, 'name', policyname, 'roles', roles, 'command', cmd,
    'using', qual, 'with_check', with_check
  ) order by tablename, policyname) from pg_policies where schemaname='public'
    and tablename in ('profiles','skills','topics','study_sessions','study_plans')),
  'functions', (select jsonb_agg(jsonb_build_object(
    'name', p.proname, 'security_definer', p.prosecdef,
    'anonymous_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cadence_snapshot','cadence_apply_changes','handle_new_cadence_user')),
  'triggers', (select jsonb_agg(jsonb_build_object(
    'table', c.relname, 'name', t.tgname, 'enabled', t.tgenabled
  ) order by c.relname, t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and t.tgname in (
      'cadence_user_created','profiles_updated','skills_updated','topics_updated',
      'sessions_updated','plans_updated','skills_revision','topics_revision','sessions_revision','plans_revision')),
  'foreign_keys', (select jsonb_agg(jsonb_build_object(
    'table', c.relname, 'definition', pg_get_constraintdef(k.oid)
  ) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace where k.contype='f' and n.nspname='public'
    and c.relname in ('profiles','skills','topics','study_sessions','study_plans')),
  'indexes', (select jsonb_agg(jsonb_build_object(
    'table', tablename, 'name', indexname, 'definition', indexdef
  ) order by tablename,indexname) from pg_indexes where schemaname='public'
    and tablename in ('profiles','skills','topics','study_sessions','study_plans'))
)) as cadence_schema_verification;
commit;
