-- GALAXY MACRO LIVE: backend-owned Trading Economics ingestion and deterministic XAUUSD signals.
begin;

create table if not exists public.macro_raw_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider='TRADING_ECONOMICS'),
  source text not null check (source in ('STREAM','REST_SYNC','RECONCILIATION')),
  calendar_id text,
  payload jsonb not null,
  normalized_payload jsonb not null,
  scheduled_at timestamptz,
  provider_updated_at timestamptz,
  received_at timestamptz not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  unique(provider,payload_hash)
);

create table if not exists public.macro_releases (
  id uuid primary key default gen_random_uuid(),
  engine text not null check (engine in ('CPI','PPI','NFP','PCE','RETAIL_SALES','FOMC')),
  release_key text not null unique,
  release_date date not null,
  reference_period text,
  country text not null default 'United States' check (country='United States'),
  scheduled_at timestamptz not null,
  status text not null default 'WAITING' check (status in ('WAITING','PRELIMINARY','CONFIRMED','WAIT_FOR_STATEMENT','REJECTED')),
  received_components jsonb not null default '[]'::jsonb,
  late_update_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.macro_release_components (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.macro_releases(id) on delete cascade,
  raw_event_id uuid references public.macro_raw_events(id) on delete set null,
  calendar_id text,
  indicator text not null,
  label text not null,
  actual_raw text,
  actual numeric,
  forecast_raw text,
  forecast numeric,
  forecast_pre_release numeric,
  forecast_live numeric,
  previous_raw text,
  previous numeric,
  revised_raw text,
  revised numeric,
  te_forecast_raw text,
  te_forecast numeric,
  unit text not null default '',
  ticker text,
  symbol text,
  weight numeric(8,6) not null check (weight>0 and weight<=1),
  direction_for_gold smallint not null check (direction_for_gold in (-1,1)),
  surprise_threshold numeric not null check (surprise_threshold>0),
  required boolean not null default false,
  provider_timestamp timestamptz,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(release_id,indicator)
);

create table if not exists public.macro_signals (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.macro_releases(id) on delete cascade,
  engine text not null check (engine in ('CPI','PPI','NFP','PCE','RETAIL_SALES','FOMC')),
  engine_version text not null,
  signal text not null check (signal in ('NO_SIGNAL','STRONG_BUY','BUY','WAIT','NEUTRAL','MIXED','SELL','STRONG_SELL')),
  galaxy_score integer not null check (galaxy_score between -100 and 100),
  confidence text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  status text not null check (status in ('PRELIMINARY','CONFIRMED','WAIT_FOR_STATEMENT','REJECTED')),
  reason text,
  explanation jsonb not null default '[]'::jsonb,
  component_scores jsonb not null default '[]'::jsonb,
  rules_snapshot jsonb not null,
  received_at timestamptz,
  generated_at timestamptz not null,
  network_release_latency_ms integer,
  processing_ms integer check (processing_ms is null or processing_ms>=0),
  version integer not null check (version>=1),
  created_at timestamptz not null default now(),
  unique(release_id,version)
);
alter table public.macro_signals add column if not exists network_release_latency_ms integer;

create table if not exists public.macro_engine_config (
  engine text not null check (engine in ('CPI','PPI','NFP','PCE','RETAIL_SALES','FOMC')),
  indicator text not null,
  label text not null,
  aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(aliases)='array'),
  ticker text,
  symbol text,
  weight numeric(8,6) not null check (weight>0 and weight<=1),
  direction_for_gold smallint not null check (direction_for_gold in (-1,1)),
  surprise_threshold numeric not null check (surprise_threshold>0),
  required boolean not null default false,
  priority integer not null check (priority>0),
  enabled boolean not null default true,
  provider_mapping_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(engine,indicator)
);

create table if not exists public.macro_runtime_config (
  id boolean primary key default true check (id),
  aggregation_window_ms integer not null default 350 check (aggregation_window_ms between 100 and 2000),
  late_update_window_ms integer not null default 3000 check (late_update_window_ms between 500 and 15000),
  allow_te_forecast_fallback boolean not null default false check (allow_te_forecast_fallback=false),
  updated_at timestamptz not null default now()
);

insert into public.macro_runtime_config(id) values(true) on conflict(id) do nothing;

create table if not exists public.macro_feed_health (
  provider text primary key check (provider='TRADING_ECONOMICS'),
  connected boolean not null default false,
  connected_at timestamptz,
  last_message_at timestamptz,
  last_heartbeat_at timestamptz,
  last_reconnect_at timestamptz,
  reconnect_count integer not null default 0 check (reconnect_count>=0),
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.macro_feed_health(provider) values('TRADING_ECONOMICS') on conflict(provider) do nothing;

-- Extends the existing private Realtime authorization without changing any
-- meeting/user topic. Macro subscribers are read-only active accounts.
create or replace function public.can_access_realtime_topic(p_topic text,p_extension text) returns boolean
language sql stable security definer set search_path=public,auth as $$
  select public.is_current_session_valid() and (p_extension in ('broadcast','presence') or p_extension='postgres_changes') and (
    p_topic='user:'||(select auth.uid())::text
    or (p_topic='community:online' and p_extension='presence' and public.has_active_membership((select auth.uid())))
    or p_topic like 'db:notifications:'||(select auth.uid())::text||':%'
    or p_topic like 'db:wallet:'||(select auth.uid())::text||':%'
    or (p_topic like 'db:macro:%' and public.has_active_membership((select auth.uid())))
    or (public.has_active_membership((select auth.uid())) and exists(
      select 1 from public.meeting_participants p
      where p.user_id=(select auth.uid()) and (
        (p.status='ADMITTED' and p_topic='meeting:'||p.meeting_id::text)
        or (p.status<>'DENIED' and p_topic like 'db:participants:'||p.meeting_id::text||':%')
      )
    ))
  );
$$;

insert into public.macro_engine_config(engine,indicator,label,aliases,ticker,symbol,weight,direction_for_gold,surprise_threshold,required,priority) values
('CPI','CORE_CPI_MOM','Core CPI MoM','["Core CPI MoM","Core Inflation Rate MoM","CPI ex Food and Energy MoM"]',null,null,.45,-1,.1,true,1),
('CPI','CPI_MOM','CPI MoM','["CPI MoM","Inflation Rate MoM"]',null,null,.30,-1,.1,true,2),
('CPI','CORE_CPI_YOY','Core CPI YoY','["Core CPI YoY","Core Inflation Rate YoY"]','USACORECPIRATE','USACORECPIRATE',.15,-1,.2,false,3),
('CPI','CPI_YOY','CPI YoY','["CPI YoY","Inflation Rate YoY"]',null,null,.10,-1,.2,false,4),
('PPI','CORE_PPI_MOM','Core PPI MoM','["Core PPI MoM","Core Producer Prices MoM","PPI ex Food and Energy MoM"]',null,null,.40,-1,.2,true,1),
('PPI','PPI_MOM','PPI MoM','["PPI MoM","Producer Price Inflation MoM"]',null,null,.35,-1,.2,true,2),
('PPI','CORE_PPI_YOY','Core PPI YoY','["Core PPI YoY","Core Producer Prices YoY"]',null,null,.15,-1,.3,false,3),
('PPI','PPI_YOY','PPI YoY','["PPI YoY","Producer Price Inflation YoY"]',null,null,.10,-1,.3,false,4),
('NFP','NON_FARM_PAYROLLS','Non Farm Payrolls','["Non Farm Payrolls","Nonfarm Payrolls"]','NFP TCH','NFP TCH',.45,-1,50000,true,1),
('NFP','UNEMPLOYMENT_RATE','Unemployment Rate','["Unemployment Rate"]','USURTOT','USURTOT',.30,1,.1,true,2),
('NFP','AVERAGE_HOURLY_EARNINGS_MOM','Average Hourly Earnings MoM','["Average Hourly Earnings MoM","Average Earnings MoM"]',null,null,.25,-1,.1,true,3),
('PCE','CORE_PCE_MOM','Core PCE Price Index MoM','["Core PCE Price Index MoM","Core PCE MoM"]','USACPPIM','USACPPIM',.50,-1,.1,true,1),
('PCE','PCE_MOM','PCE Price Index MoM','["PCE Price Index MoM","PCE MoM"]',null,null,.25,-1,.1,false,2),
('PCE','CORE_PCE_YOY','Core PCE Price Index YoY','["Core PCE Price Index YoY","Core PCE YoY"]',null,null,.15,-1,.2,false,3),
('PCE','PCE_YOY','PCE Price Index YoY','["PCE Price Index YoY","PCE YoY"]',null,null,.10,-1,.2,false,4),
('RETAIL_SALES','RETAIL_SALES_MOM','Retail Sales MoM','["Retail Sales MoM"]','RSTAMOM','RSTAMOM',.45,-1,.3,true,1),
('RETAIL_SALES','RETAIL_SALES_EX_AUTOS','Retail Sales Ex Autos','["Retail Sales Ex Autos MoM","Retail Sales Ex Autos","Core Retail Sales MoM"]',null,null,.35,-1,.3,true,2),
('RETAIL_SALES','RETAIL_CONTROL_GROUP','Retail Sales Control Group','["Retail Sales Control Group","Retail Sales Control Group MoM"]',null,null,.20,-1,.3,false,3),
('FOMC','FEDERAL_FUNDS_RATE','Federal Funds Rate','["Fed Interest Rate Decision","Federal Funds Rate","Interest Rate Decision"]',null,null,1,-1,.25,true,1)
on conflict(engine,indicator) do nothing;

create index if not exists macro_raw_calendar_idx on public.macro_raw_events(calendar_id,received_at desc);
create index if not exists macro_releases_schedule_idx on public.macro_releases(engine,scheduled_at desc);
create index if not exists macro_components_calendar_idx on public.macro_release_components(calendar_id);
create index if not exists macro_signals_latest_idx on public.macro_signals(engine,generated_at desc);

drop trigger if exists macro_releases_touch_updated_at on public.macro_releases;
create trigger macro_releases_touch_updated_at before update on public.macro_releases for each row execute function public.touch_updated_at();
drop trigger if exists macro_components_touch_updated_at on public.macro_release_components;
create trigger macro_components_touch_updated_at before update on public.macro_release_components for each row execute function public.touch_updated_at();
drop trigger if exists macro_config_touch_updated_at on public.macro_engine_config;
create trigger macro_config_touch_updated_at before update on public.macro_engine_config for each row execute function public.touch_updated_at();
drop trigger if exists macro_runtime_touch_updated_at on public.macro_runtime_config;
create trigger macro_runtime_touch_updated_at before update on public.macro_runtime_config for each row execute function public.touch_updated_at();
drop trigger if exists macro_health_touch_updated_at on public.macro_feed_health;
create trigger macro_health_touch_updated_at before update on public.macro_feed_health for each row execute function public.touch_updated_at();

create or replace function public.macro_release_view(p_release public.macro_releases) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',p_release.id,'engine',p_release.engine,'releaseDate',p_release.release_date,'referencePeriod',p_release.reference_period,
    'scheduledAt',p_release.scheduled_at,'status',p_release.status,
    'components',coalesce((select jsonb_agg(jsonb_build_object(
      'indicator',c.indicator,'label',c.label,'actual',c.actual,'actualRaw',c.actual_raw,
      'forecast',c.forecast,'forecastRaw',c.forecast_raw,'forecastPreRelease',c.forecast_pre_release,'forecastLive',c.forecast_live,
      'previous',c.previous,'previousRaw',c.previous_raw,'revised',c.revised,'revisedRaw',c.revised_raw,
      'teForecast',c.te_forecast,'teForecastRaw',c.te_forecast_raw,'unit',c.unit,'calendarId',c.calendar_id,
      'ticker',c.ticker,'symbol',c.symbol,'importance',coalesce((raw.normalized_payload->>'importance')::numeric,0),
      'providerUpdatedAt',c.provider_timestamp,'receivedAt',c.received_at
    ) order by config.priority) from public.macro_release_components c
      left join public.macro_raw_events raw on raw.id=c.raw_event_id
      left join public.macro_engine_config config on config.engine=p_release.engine and config.indicator=c.indicator
      where c.release_id=p_release.id),'[]'::jsonb),
    'signal',(select jsonb_build_object(
      'id',s.id,'signal',s.signal,'galaxyScore',s.galaxy_score,'confidence',s.confidence,'status',s.status,'reason',s.reason,
      'explanation',s.explanation,'componentScores',s.component_scores,'receivedAt',s.received_at,'generatedAt',s.generated_at,
      'networkReleaseLatencyMs',s.network_release_latency_ms,'processingMs',s.processing_ms,'version',s.version,'engineVersion',s.engine_version
    ) from public.macro_signals s where s.release_id=p_release.id order by s.version desc limit 1)
  );
$$;

create or replace function public.get_macro_dashboard() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  with me as (select public.require_active_membership() id),
  engines(engine,label,sort_order) as (values ('CPI','CPI',1),('PPI','PPI',2),('NFP','NFP',3),('PCE','PCE',4),('RETAIL_SALES','RETAIL SALES',5),('FOMC','FOMC',6))
  select jsonb_build_object(
    'serverNow',now(),
    'canManage',exists(select 1 from public.profiles p,me where p.id=me.id and p.role='ADMIN' and p.status='ACTIVE'),
    'health',coalesce((select jsonb_build_object('provider',h.provider,'connected',h.connected,
      'stale',not h.connected or h.last_heartbeat_at is null or h.last_heartbeat_at<now()-interval '130 seconds',
      'connectedAt',h.connected_at,'lastMessageAt',h.last_message_at,'lastHeartbeatAt',h.last_heartbeat_at,
      'lastReconnectAt',h.last_reconnect_at,'reconnectCount',h.reconnect_count,'lastError',h.last_error)
      from public.macro_feed_health h where h.provider='TRADING_ECONOMICS'),jsonb_build_object('connected',false,'stale',true)),
    'engines',coalesce((select jsonb_agg(jsonb_build_object(
      'engine',e.engine,'label',e.label,
      'enabled',exists(select 1 from public.macro_engine_config c where c.engine=e.engine and c.enabled),
      'nextRelease',(select public.macro_release_view(r) from public.macro_releases r
        where r.engine=e.engine and r.scheduled_at>=now()-interval '10 minutes' order by r.scheduled_at limit 1),
      'latestRelease',(select public.macro_release_view(r) from public.macro_releases r
        where r.engine=e.engine and exists(select 1 from public.macro_signals s where s.release_id=r.id)
        order by r.scheduled_at desc limit 1)
    ) order by e.sort_order) from engines e),'[]'::jsonb)
  ) from me;
$$;

create or replace function public.get_macro_admin_config() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  with admin as (select public.require_admin() id)
  select jsonb_build_object(
    'components',coalesce((select jsonb_agg(jsonb_build_object('engine',c.engine,'indicator',c.indicator,'label',c.label,
      'aliases',c.aliases,'ticker',c.ticker,'symbol',c.symbol,'weight',c.weight,'directionForGold',c.direction_for_gold,
      'surpriseThreshold',c.surprise_threshold,'required',c.required,'priority',c.priority,'enabled',c.enabled,
      'mappingVerifiedAt',c.provider_mapping_verified_at) order by c.engine,c.priority) from public.macro_engine_config c),'[]'::jsonb),
    'runtime',(select jsonb_build_object('aggregationWindowMs',r.aggregation_window_ms,'lateUpdateWindowMs',r.late_update_window_ms,
      'allowTeForecastFallback',r.allow_te_forecast_fallback) from public.macro_runtime_config r where r.id),
    'health',(select jsonb_build_object('connected',h.connected,'lastMessageAt',h.last_message_at,'lastHeartbeatAt',h.last_heartbeat_at,
      'reconnectCount',h.reconnect_count,'lastError',h.last_error) from public.macro_feed_health h where h.provider='TRADING_ECONOMICS')
  ) from admin;
$$;

create or replace function public.update_macro_engine_config(p_engine text,p_indicator text,p_enabled boolean,p_weight numeric,
  p_surprise_threshold numeric,p_required boolean,p_aliases jsonb) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_admin uuid:=public.require_admin(); v_config public.macro_engine_config;
begin
  if p_weight<=0 or p_weight>1 or p_surprise_threshold<=0 then raise exception 'Peso o umbral macro inválido.' using errcode='P0001'; end if;
  if jsonb_typeof(p_aliases)<>'array' or jsonb_array_length(p_aliases)=0 then raise exception 'Debes conservar al menos un alias.' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_aliases) alias where length(trim(alias)) not between 2 and 120) then
    raise exception 'Los alias macro deben tener entre 2 y 120 caracteres.' using errcode='P0001';
  end if;
  update public.macro_engine_config set enabled=coalesce(p_enabled,false),weight=p_weight,surprise_threshold=p_surprise_threshold,
    required=coalesce(p_required,false),aliases=p_aliases where engine=p_engine and indicator=p_indicator returning * into v_config;
  if v_config.indicator is null then raise exception 'No encontramos ese indicador macro.' using errcode='P0001'; end if;
  return jsonb_build_object('engine',v_config.engine,'indicator',v_config.indicator,'updated',true);
end; $$;

create or replace function public.update_macro_runtime_config(p_aggregation_window_ms integer,p_late_update_window_ms integer) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_admin uuid:=public.require_admin(); v_runtime public.macro_runtime_config;
begin
  if p_aggregation_window_ms not between 100 and 2000 or p_late_update_window_ms not between 500 and 15000
    or p_late_update_window_ms<=p_aggregation_window_ms then raise exception 'Las ventanas de agregación no son válidas.' using errcode='P0001'; end if;
  update public.macro_runtime_config set aggregation_window_ms=p_aggregation_window_ms,late_update_window_ms=p_late_update_window_ms
  where id returning * into v_runtime;
  return jsonb_build_object('aggregationWindowMs',v_runtime.aggregation_window_ms,'lateUpdateWindowMs',v_runtime.late_update_window_ms);
end; $$;

create or replace function public.set_macro_engine_enabled(p_engine text,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_admin uuid:=public.require_admin(); v_count integer:=0;
begin
  update public.macro_engine_config set enabled=coalesce(p_enabled,false) where engine=p_engine;
  get diagnostics v_count=row_count;
  if v_count=0 then raise exception 'No encontramos ese engine macro.' using errcode='P0001'; end if;
  return jsonb_build_object('engine',p_engine,'enabled',coalesce(p_enabled,false),'componentsUpdated',v_count);
end; $$;

alter table public.macro_raw_events enable row level security;
alter table public.macro_releases enable row level security;
alter table public.macro_release_components enable row level security;
alter table public.macro_signals enable row level security;
alter table public.macro_engine_config enable row level security;
alter table public.macro_runtime_config enable row level security;
alter table public.macro_feed_health enable row level security;

drop policy if exists macro_releases_active_read on public.macro_releases;
create policy macro_releases_active_read on public.macro_releases for select to authenticated using (public.has_active_membership(auth.uid()) and public.is_current_session_valid());
drop policy if exists macro_components_active_read on public.macro_release_components;
create policy macro_components_active_read on public.macro_release_components for select to authenticated using (public.has_active_membership(auth.uid()) and public.is_current_session_valid());
drop policy if exists macro_signals_active_read on public.macro_signals;
create policy macro_signals_active_read on public.macro_signals for select to authenticated using (public.has_active_membership(auth.uid()) and public.is_current_session_valid());
drop policy if exists macro_health_active_read on public.macro_feed_health;
create policy macro_health_active_read on public.macro_feed_health for select to authenticated using (public.has_active_membership(auth.uid()) and public.is_current_session_valid());

do $$ begin alter publication supabase_realtime add table public.macro_releases; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.macro_signals; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.macro_feed_health; exception when duplicate_object then null; end $$;

revoke all on public.macro_raw_events,public.macro_releases,public.macro_release_components,public.macro_signals,
  public.macro_engine_config,public.macro_runtime_config,public.macro_feed_health from public,anon,authenticated;
grant select on public.macro_releases,public.macro_release_components,public.macro_signals,public.macro_feed_health to authenticated;
grant all on public.macro_raw_events,public.macro_releases,public.macro_release_components,public.macro_signals,
  public.macro_engine_config,public.macro_runtime_config,public.macro_feed_health to service_role;
revoke execute on function public.macro_release_view(public.macro_releases),public.get_macro_dashboard(),public.get_macro_admin_config(),
  public.update_macro_engine_config(text,text,boolean,numeric,numeric,boolean,jsonb),public.update_macro_runtime_config(integer,integer)
  ,public.set_macro_engine_enabled(text,boolean)
  from public,anon,authenticated;
grant execute on function public.get_macro_dashboard() to authenticated;
grant execute on function public.get_macro_admin_config(),public.update_macro_engine_config(text,text,boolean,numeric,numeric,boolean,jsonb),
  public.update_macro_runtime_config(integer,integer) to authenticated;
grant execute on function public.set_macro_engine_enabled(text,boolean) to authenticated;
grant execute on function public.can_access_realtime_topic(text,text) to authenticated;

commit;
