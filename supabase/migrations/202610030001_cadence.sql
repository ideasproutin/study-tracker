-- Cadence schema. Apply using Supabase SQL Editor or `supabase db push`.
-- All app RPCs execute as the caller; RLS applies to every row operation.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  avatar_url text,
  daily_target_minutes integer not null default 60 check (daily_target_minutes between 1 and 1440),
  onboarding_done boolean not null default false,
  active_timer jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color text not null default '#49cee3' check (color ~ '^#[0-9a-fA-F]{6}$'),
  target_hours numeric not null default 0 check (target_hours between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_completion_consistent check (completed = (completed_at is not null)),
  unique (id, user_id),
  unique (id, skill_id, user_id),
  foreign key (skill_id, user_id) references public.skills(id, user_id) on delete cascade
);
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null,
  topic_id uuid,
  topic_name text not null check (char_length(btrim(topic_name)) between 1 and 200),
  -- Fractional minutes preserve actual elapsed timer seconds without rounding up.
  duration_minutes numeric not null check (duration_minutes > 0 and duration_minutes <= 1440),
  notes text not null default '' check (char_length(notes) <= 10000),
  started_at timestamptz not null,
  study_date date not null,
  study_time time not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (skill_id, user_id) references public.skills(id, user_id) on delete cascade,
  foreign key (topic_id, skill_id, user_id) references public.topics(id, skill_id, user_id)
    on delete set null (topic_id) deferrable initially deferred
);
create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null,
  study_date date not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.topics(id, user_id) on delete cascade,
  foreign key (session_id, user_id) references public.study_sessions(id, user_id)
    on delete set null (session_id) deferrable initially deferred
);

create index skills_user_id_idx on public.skills(user_id);
create index topics_user_skill_idx on public.topics(user_id, skill_id);
create index sessions_user_date_idx on public.study_sessions(user_id, study_date desc);
create index sessions_user_started_idx on public.study_sessions(user_id, started_at desc);
create index sessions_skill_idx on public.study_sessions(skill_id, user_id);
create index sessions_topic_idx on public.study_sessions(topic_id, skill_id, user_id);
create index plans_user_date_idx on public.study_plans(user_id, study_date);
create index plans_topic_idx on public.study_plans(topic_id, user_id);
create index plans_session_idx on public.study_plans(session_id, user_id);

-- Automatically create empty profiles; this trigger alone requires definer rights.
create function public.handle_new_cadence_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100));
  return new;
end;
$$;
revoke all on function public.handle_new_cadence_user() from public, anon, authenticated;
create trigger cadence_user_created after insert on auth.users
  for each row execute function public.handle_new_cadence_user();
-- Existing auth users also get empty profiles, never fabricated study activity.
insert into public.profiles(id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', ''),100)
from auth.users on conflict (id) do nothing;

create function public.cadence_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  if tg_table_name = 'profiles' then new.revision = old.revision + 1; end if;
  return new;
end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.cadence_touch_updated_at();
create trigger skills_updated before update on public.skills for each row execute function public.cadence_touch_updated_at();
create trigger topics_updated before update on public.topics for each row execute function public.cadence_touch_updated_at();
create trigger sessions_updated before update on public.study_sessions for each row execute function public.cadence_touch_updated_at();
create trigger plans_updated before update on public.study_plans for each row execute function public.cadence_touch_updated_at();

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.topics enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_plans enable row level security;
create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy skills_owner on public.skills for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy topics_owner on public.topics for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sessions_owner on public.study_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy plans_owner on public.study_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.profiles, public.skills, public.topics, public.study_sessions, public.study_plans from anon;
grant select, insert, update, delete on public.profiles, public.skills, public.topics, public.study_sessions, public.study_plans to authenticated;

-- Increment the owner revision on direct table writes too, so concurrent clients
-- cannot replace data loaded before another device changed it.
create function public.cadence_bump_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.profiles set revision = revision + 1
    where id = case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  return null;
end;
$$;
create trigger skills_revision after insert or update or delete on public.skills for each row execute function public.cadence_bump_revision();
create trigger topics_revision after insert or update or delete on public.topics for each row execute function public.cadence_bump_revision();
create trigger sessions_revision after insert or update or delete on public.study_sessions for each row execute function public.cadence_bump_revision();
create trigger plans_revision after insert or update or delete on public.study_plans for each row execute function public.cadence_bump_revision();

-- One snapshot avoids mixed versions from independent multi-table reads.
create function public.cadence_snapshot() returns jsonb
language sql volatile security invoker set search_path = '' as $$
select jsonb_build_object(
  'revision', p.revision,
  'profile', jsonb_build_object('id',p.id,'displayName',p.display_name,'avatarUrl',p.avatar_url),
  'data', jsonb_build_object(
    'version',1,
    'preferences',jsonb_build_object('dailyTarget',p.daily_target_minutes,'onboardingDone',p.onboarding_done),
    'timer',p.active_timer,
    'skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'color',s.color,'targetHours',s.target_hours,'createdAt',s.created_at) order by s.created_at,s.id) from public.skills s where s.user_id = p.id),'[]'::jsonb),
    'topics',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'skillId',t.skill_id,'name',t.name,'createdAt',t.created_at,'completedAt',t.completed_at) order by t.created_at,t.id) from public.topics t where t.user_id = p.id),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'skillId',s.skill_id,'topicId',s.topic_id,'topic',s.topic_name,'minutes',s.duration_minutes,'date',s.study_date,'time',left(s.study_time::text,5),'notes',s.notes,'completed',s.completed,'createdAt',s.created_at) order by s.study_date,s.study_time,s.id) from public.study_sessions s where s.user_id = p.id),'[]'::jsonb),
    'plans',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'topicId',q.topic_id,'date',q.study_date,'minutes',q.duration_minutes,'sessionId',q.session_id) order by q.study_date,q.created_at,q.id) from public.study_plans q where q.user_id = p.id),'[]'::jsonb)
  )
) from public.profiles p where p.id = (select auth.uid());
$$;

-- Apply only changed rows, in a single transaction with a version check.
-- Ownership is assigned from auth.uid(), never trusted from request payloads.
create function public.cadence_apply_changes(expected_revision bigint, changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_revision bigint; r jsonb; t jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select revision into current_revision from public.profiles where id = owner_id for update;
  if not found then raise exception 'Cadence profile is missing'; end if;
  if current_revision <> expected_revision then
    raise exception 'Your study data changed on another device. Refresh and try again.' using errcode = '40001';
  end if;
  if jsonb_typeof(changes) <> 'object' then raise exception 'Invalid changes'; end if;

  -- Remove dependents first. Foreign keys protect cross-user references.
  delete from public.study_plans where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{plans,delete}','[]'::jsonb)));
  delete from public.study_sessions where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{sessions,delete}','[]'::jsonb)));
  delete from public.topics where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{topics,delete}','[]'::jsonb)));
  delete from public.skills where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{skills,delete}','[]'::jsonb)));

  for r in select value from jsonb_array_elements(coalesce(changes #> '{skills,upsert}','[]'::jsonb)) loop
    insert into public.skills(id,user_id,name,color,target_hours,created_at)
    values ((r->>'id')::uuid,owner_id,r->>'name',r->>'color',(r->>'targetHours')::numeric,(r->>'createdAt')::timestamptz)
    on conflict (id) do update set name=excluded.name,color=excluded.color,target_hours=excluded.target_hours;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(changes #> '{topics,upsert}','[]'::jsonb)) loop
    insert into public.topics(id,user_id,skill_id,name,completed,completed_at,created_at)
    values ((r->>'id')::uuid,owner_id,(r->>'skillId')::uuid,r->>'name',r->>'completedAt' is not null,(r->>'completedAt')::timestamptz,(r->>'createdAt')::timestamptz)
    on conflict (id) do update set skill_id=excluded.skill_id,name=excluded.name,completed=excluded.completed,completed_at=excluded.completed_at;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(changes #> '{sessions,upsert}','[]'::jsonb)) loop
    insert into public.study_sessions(id,user_id,skill_id,topic_id,topic_name,duration_minutes,notes,started_at,study_date,study_time,completed,created_at)
    values ((r->>'id')::uuid,owner_id,(r->>'skillId')::uuid,(r->>'topicId')::uuid,r->>'topic',(r->>'minutes')::numeric,r->>'notes',(r->>'startedAt')::timestamptz,(r->>'date')::date,(r->>'time')::time,(r->>'completed')::boolean,(r->>'createdAt')::timestamptz)
    on conflict (id) do update set skill_id=excluded.skill_id,topic_id=excluded.topic_id,topic_name=excluded.topic_name,duration_minutes=excluded.duration_minutes,notes=excluded.notes,started_at=excluded.started_at,study_date=excluded.study_date,study_time=excluded.study_time,completed=excluded.completed;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(changes #> '{plans,upsert}','[]'::jsonb)) loop
    insert into public.study_plans(id,user_id,topic_id,study_date,duration_minutes,session_id)
    values ((r->>'id')::uuid,owner_id,(r->>'topicId')::uuid,(r->>'date')::date,(r->>'minutes')::integer,(r->>'sessionId')::uuid)
    on conflict (id) do update set topic_id=excluded.topic_id,study_date=excluded.study_date,duration_minutes=excluded.duration_minutes,session_id=excluded.session_id;
  end loop;
  if changes ? 'preferences' then
    update public.profiles set daily_target_minutes=(changes #>> '{preferences,dailyTarget}')::integer,
      onboarding_done=(changes #>> '{preferences,onboardingDone}')::boolean where id=owner_id;
  end if;
  if changes ? 'timer' then
    t := nullif(changes->'timer','null'::jsonb);
    if t is not null then
      if jsonb_typeof(t) <> 'object' or not exists(select 1 from public.skills where user_id=owner_id and id=(t->>'skillId')::uuid)
        or (t->>'topicId' is not null and not exists(select 1 from public.topics where user_id=owner_id and id=(t->>'topicId')::uuid and skill_id=(t->>'skillId')::uuid))
        or (t->>'planId' is not null and not exists(select 1 from public.study_plans where user_id=owner_id and id=(t->>'planId')::uuid)) then
        raise exception 'Invalid timer reference';
      end if;
    end if;
    update public.profiles set active_timer=t where id=owner_id;
  end if;
  -- A final increment covers preference/timer-only saves and full resets.
  update public.profiles set revision=revision+1 where id=owner_id;
  return public.cadence_snapshot();
end;
$$;
revoke all on function public.cadence_snapshot() from public, anon;
revoke all on function public.cadence_apply_changes(bigint,jsonb) from public, anon;
grant execute on function public.cadence_snapshot() to authenticated;
grant execute on function public.cadence_apply_changes(bigint,jsonb) to authenticated;

-- Profile revision notifications are enough to refresh all study data.
-- App also polls and refreshes on focus/reconnection if Realtime is unavailable.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
    not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
commit;
