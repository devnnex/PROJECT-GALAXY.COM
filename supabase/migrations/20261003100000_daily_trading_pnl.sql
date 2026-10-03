begin;

create table if not exists public.trading_pnl_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  trading_date date not null,
  amount_usd numeric(14,2) not null check (abs(amount_usd) <= 99999999.99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,trading_date),
  check (extract(isodow from trading_date) between 1 and 5)
);

create index if not exists trading_pnl_entries_user_date_idx
on public.trading_pnl_entries(user_id,trading_date desc);

drop trigger if exists trading_pnl_entries_touch_updated_at on public.trading_pnl_entries;
create trigger trading_pnl_entries_touch_updated_at before update on public.trading_pnl_entries
for each row execute function public.touch_updated_at();

create or replace function public.is_trading_pnl_controller() returns boolean
language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from auth.users account join public.profiles profile on profile.id=account.id
    where account.id=auth.uid() and lower(account.email)='elkin56ty@gmail.com'
      and profile.status='ACTIVE' and not profile.is_guest
  );
$$;

drop function if exists public.get_trading_pnl(date);
create or replace function public.get_trading_pnl(p_month date default current_date,p_user_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare
  v_requester uuid:=public.require_registered_member();
  v_controller boolean:=public.is_trading_pnl_controller();
  v_target uuid:=coalesce(p_user_id,v_requester);
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_profile public.profiles;
begin
  if v_target<>v_requester and not v_controller then
    raise exception 'Solo puedes consultar tu propio PNL.' using errcode='P0001';
  end if;
  select * into v_profile from public.profiles where id=v_target and not is_guest;
  if v_profile.id is null then
    raise exception 'El usuario registrado ya no esta disponible.' using errcode='P0001';
  end if;
  return jsonb_build_object(
    'month',to_char(v_month,'YYYY-MM-DD'),
    'canReview',v_controller,
    'viewingUser',jsonb_build_object('id',v_profile.id,'name',v_profile.name,'username',v_profile.username,'status',v_profile.status,'isSelf',v_target=v_requester),
    'users',case when v_controller then coalesce((
      select jsonb_agg(jsonb_build_object('id',profile.id,'name',profile.name,'username',profile.username,'status',profile.status) order by profile.name,profile.username)
      from public.profiles profile where not profile.is_guest
    ),'[]'::jsonb) else '[]'::jsonb end,
    'entries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',to_char(entry.trading_date,'YYYY-MM-DD'),
        'amountUsd',entry.amount_usd,
        'updatedAt',entry.updated_at
      ) order by entry.trading_date)
      from public.trading_pnl_entries entry
      where entry.user_id=v_target
        and entry.trading_date>=v_month
        and entry.trading_date<(v_month+interval '1 month')::date
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'month',to_char(summary.month_start,'YYYY-MM-DD'),
        'totalUsd',summary.total_usd,
        'tradingDays',summary.trading_days,
        'winningDays',summary.winning_days,
        'losingDays',summary.losing_days
      ) order by summary.month_start desc)
      from (
        select date_trunc('month',entry.trading_date)::date month_start,
          sum(entry.amount_usd) total_usd,
          count(*)::integer trading_days,
          count(*) filter(where entry.amount_usd>0)::integer winning_days,
          count(*) filter(where entry.amount_usd<0)::integer losing_days
        from public.trading_pnl_entries entry
        where entry.user_id=v_target
        group by 1
        order by 1 desc
        limit 24
      ) summary
    ),'[]'::jsonb)
  );
end; $$;

create or replace function public.save_trading_pnl(p_trading_date date,p_amount_usd numeric) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_user uuid:=public.require_registered_member();
  v_entry public.trading_pnl_entries;
begin
  if p_trading_date is null or p_amount_usd is null then
    raise exception 'Indica la fecha y el resultado en dÃ³lares.' using errcode='P0001';
  end if;
  if p_trading_date>current_date then
    raise exception 'No puedes registrar resultados futuros.' using errcode='P0001';
  end if;
  if extract(isodow from p_trading_date) not between 1 and 5 then
    raise exception 'El registro PNL estÃ¡ disponible de lunes a viernes.' using errcode='P0001';
  end if;
  if abs(p_amount_usd)>99999999.99 then
    raise exception 'El importe supera el lÃ­mite permitido.' using errcode='P0001';
  end if;
  insert into public.trading_pnl_entries(user_id,trading_date,amount_usd)
  values(v_user,p_trading_date,round(p_amount_usd,2))
  on conflict(user_id,trading_date) do update set amount_usd=excluded.amount_usd,updated_at=now()
  returning * into v_entry;
  return jsonb_build_object(
    'date',to_char(v_entry.trading_date,'YYYY-MM-DD'),
    'amountUsd',v_entry.amount_usd,
    'updatedAt',v_entry.updated_at
  );
end; $$;

create or replace function public.delete_trading_pnl(p_trading_date date) returns boolean
language plpgsql security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_registered_member();
begin
  delete from public.trading_pnl_entries
  where user_id=v_user and trading_date=p_trading_date;
  return found;
end; $$;

alter table public.trading_pnl_entries enable row level security;

drop policy if exists trading_pnl_entries_owner_read on public.trading_pnl_entries;
create policy trading_pnl_entries_owner_read on public.trading_pnl_entries for select to authenticated
using (public.is_current_session_valid() and user_id=auth.uid());

drop policy if exists trading_pnl_entries_owner_insert on public.trading_pnl_entries;
create policy trading_pnl_entries_owner_insert on public.trading_pnl_entries for insert to authenticated
with check (public.is_current_session_valid() and user_id=auth.uid());

drop policy if exists trading_pnl_entries_owner_update on public.trading_pnl_entries;
create policy trading_pnl_entries_owner_update on public.trading_pnl_entries for update to authenticated
using (public.is_current_session_valid() and user_id=auth.uid())
with check (public.is_current_session_valid() and user_id=auth.uid());

drop policy if exists trading_pnl_entries_owner_delete on public.trading_pnl_entries;
create policy trading_pnl_entries_owner_delete on public.trading_pnl_entries for delete to authenticated
using (public.is_current_session_valid() and user_id=auth.uid());

revoke all on table public.trading_pnl_entries from anon,authenticated;
revoke all on function public.is_trading_pnl_controller(),public.get_trading_pnl(date,uuid),public.save_trading_pnl(date,numeric),public.delete_trading_pnl(date) from public,anon,authenticated;
grant execute on function public.get_trading_pnl(date,uuid),public.save_trading_pnl(date,numeric),public.delete_trading_pnl(date) to authenticated;

commit;
