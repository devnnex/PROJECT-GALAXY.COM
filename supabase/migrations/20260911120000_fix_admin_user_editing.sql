begin;

alter table public.profiles add column if not exists user_kind text not null default 'PREMIUM'
  check (user_kind in ('PREMIUM','NEW','GALACTIC'));
alter table public.profiles add column if not exists section_permissions jsonb not null default
  '{"dashboard":false,"discover":false,"marketplace":true,"store":true,"meetings":true,"calendar":true,"messages":true,"wallet":true,"orders":true,"profile":true,"promotions":true}'::jsonb;

create or replace function public.get_current_user() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'email', u.email,
    'avatar',p.avatar,'bio', p.bio, 'role', p.role, 'level', p.level, 'xp', p.xp, 'status', p.status,
    'userKind',p.user_kind,'sectionPermissions',p.section_permissions,
    'createdAt', p.created_at, 'emailVerified', u.email_confirmed_at is not null,
    'membership',public.membership_view(p.id),
    'wallet',coalesce((select jsonb_build_object('availableBalance',w.available_balance,'pendingBalance',w.pending_balance,
      'totalEarned',w.total_earned,'totalSpent',w.total_spent,'currency',w.currency) from public.wallets w where w.user_id=p.id),
      jsonb_build_object('availableBalance',0,'pendingBalance',0,'totalEarned',0,'totalSpent',0,'currency','USDT')))
  from public.profiles p join auth.users u on u.id=p.id where p.id=public.require_user();
$$;

create or replace function public.get_admin_users() returns jsonb
language sql stable security definer set search_path=public,auth as $$
  with admin as (select public.require_admin() id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.name,'username',p.username,'email',u.email,'avatar',p.avatar,'membership',public.membership_view(p.id),'role',p.role,'status',p.status,
    'userKind',p.user_kind,'sectionPermissions',p.section_permissions,
    'createdAt',p.created_at,'lastSeenAt',s.last_seen_at,'sessionActive',s.active_session_id is not null and s.last_seen_at>now()-interval '75 seconds'
  ) order by case when p.role='ADMIN' then 0 else 1 end,p.created_at desc),'[]'::jsonb)
  from public.profiles p join auth.users u on u.id=p.id cross join admin
  left join public.user_session_state s on s.user_id=p.id
  where p.status<>'DELETED';
$$;

create or replace function public.update_admin_user(
  p_user_id uuid,p_name text,p_username text,p_user_kind text,p_section_permissions jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_admin uuid:=public.require_admin(); v_profile public.profiles;
  v_name text:=trim(coalesce(p_name,'')); v_username text:=lower(trim(coalesce(p_username,'')));
  v_kind text:=upper(trim(coalesce(p_user_kind,''))); v_permissions jsonb:=coalesce(p_section_permissions,'{}'::jsonb);
begin
  if p_user_id=v_admin or exists(select 1 from public.profiles where id=p_user_id and role='ADMIN') then
    raise exception 'No puedes modificar esa cuenta administrativa.' using errcode='P0001';
  end if;
  if char_length(v_name) not between 2 and 100 then raise exception 'El nombre debe tener entre 2 y 100 caracteres.' using errcode='P0001'; end if;
  if v_username !~ '^[a-z0-9_]{3,32}$' then raise exception 'El usuario debe tener entre 3 y 32 caracteres: letras minúsculas, números o guion bajo.' using errcode='P0001'; end if;
  if v_kind not in ('PREMIUM','NEW','GALACTIC') then raise exception 'Selecciona una categoría válida.' using errcode='P0001'; end if;
  if jsonb_typeof(v_permissions)<>'object' or exists(
    select 1 from jsonb_object_keys(v_permissions) as permission_keys(permission_key)
    where permission_key not in ('dashboard','discover','marketplace','store','meetings','calendar','messages','wallet','orders','profile','promotions')
  ) then raise exception 'Los permisos de secciones no son válidos.' using errcode='P0001'; end if;
  begin
    update public.profiles set name=v_name,username=v_username,user_kind=v_kind,
      section_permissions=jsonb_build_object(
        'dashboard',coalesce((v_permissions->>'dashboard')::boolean,false),
        'discover',coalesce((v_permissions->>'discover')::boolean,false),
        'marketplace',coalesce((v_permissions->>'marketplace')::boolean,false),
        'store',coalesce((v_permissions->>'store')::boolean,false),
        'meetings',coalesce((v_permissions->>'meetings')::boolean,false),
        'calendar',coalesce((v_permissions->>'calendar')::boolean,false),
        'messages',coalesce((v_permissions->>'messages')::boolean,false),
        'wallet',coalesce((v_permissions->>'wallet')::boolean,false),
        'orders',coalesce((v_permissions->>'orders')::boolean,false),
        'profile',coalesce((v_permissions->>'profile')::boolean,false),
        'promotions',coalesce((v_permissions->>'promotions')::boolean,false)
      )
    where id=p_user_id and role<>'ADMIN' returning * into v_profile;
  exception when unique_violation then
    raise exception 'Ese nombre de usuario ya está en uso.' using errcode='P0001';
  end;
  if v_profile.id is null then raise exception 'No encontramos ese usuario.' using errcode='P0001'; end if;
  return jsonb_build_object('id',v_profile.id,'name',v_profile.name,'username',v_profile.username,
    'userKind',v_profile.user_kind,'sectionPermissions',v_profile.section_permissions);
end; $$;

revoke all on function public.update_admin_user(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.update_admin_user(uuid,text,text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
