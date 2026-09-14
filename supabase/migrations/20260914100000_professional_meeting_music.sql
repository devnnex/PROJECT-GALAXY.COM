begin;

create table if not exists public.meeting_music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  artist text not null default '' check (char_length(artist) <= 120),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 104857600),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists meeting_music_tracks_touch_updated_at on public.meeting_music_tracks;
create trigger meeting_music_tracks_touch_updated_at before update on public.meeting_music_tracks
for each row execute function public.touch_updated_at();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('meeting-music','meeting-music',true,104857600,array[
  'audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/webm',
  'audio/wav','audio/x-wav','audio/flac','audio/x-flac'
])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.is_meeting_music_controller() returns boolean
language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from auth.users account join public.profiles profile on profile.id=account.id
    where account.id=auth.uid() and lower(account.email)='elkin56ty@gmail.com' and profile.status='ACTIVE'
  );
$$;

create or replace function public.get_meeting_music_tracks() returns jsonb
language plpgsql stable security definer set search_path=public,auth as $$
declare v_user uuid:=public.require_user(); v_result jsonb;
begin
  if not public.is_current_session_valid() then raise exception 'Tu perfil no esta activo.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',track.id,'title',track.title,'artist',track.artist,'storagePath',track.storage_path,
    'mimeType',track.mime_type,'sizeBytes',track.size_bytes,'createdAt',track.created_at
  ) order by track.sort_order,track.created_at),'[]'::jsonb) into v_result
  from public.meeting_music_tracks track where track.active;
  return v_result;
end; $$;

create or replace function public.save_meeting_music_track(
  p_id uuid,p_title text,p_artist text,p_storage_path text,p_mime_type text,p_size_bytes bigint
) returns jsonb
language plpgsql security definer set search_path=public,auth,storage as $$
declare v_user uuid:=public.require_user(); v_track public.meeting_music_tracks;
begin
  if not public.is_meeting_music_controller() then raise exception 'Solo Elkin puede administrar la musica de las reuniones.' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 120 or char_length(trim(coalesce(p_artist,'')))>120 then
    raise exception 'Los datos de la cancion no son validos.' using errcode='P0001';
  end if;
  if coalesce(p_storage_path,'') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|aac|ogg|weba|wav|flac)$'
    or split_part(p_storage_path,'/',1)<>p_id::text then
    raise exception 'La ruta del audio no es valida.' using errcode='P0001';
  end if;
  if p_mime_type not in ('audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/webm','audio/wav','audio/x-wav','audio/flac','audio/x-flac')
    or coalesce(p_size_bytes,0) not between 1 and 104857600 then raise exception 'El archivo de audio no es valido.' using errcode='P0001'; end if;
  if not exists(select 1 from storage.objects stored_object where stored_object.bucket_id='meeting-music' and stored_object.name=p_storage_path) then
    raise exception 'El archivo de audio no esta disponible.' using errcode='P0001';
  end if;
  insert into public.meeting_music_tracks(id,title,artist,storage_path,mime_type,size_bytes,sort_order,created_by)
  values(p_id,trim(p_title),trim(coalesce(p_artist,'')),p_storage_path,p_mime_type,p_size_bytes,
    coalesce((select max(sort_order)+1 from public.meeting_music_tracks),0),v_user)
  returning * into v_track;
  return jsonb_build_object('id',v_track.id,'title',v_track.title,'artist',v_track.artist,
    'storagePath',v_track.storage_path,'mimeType',v_track.mime_type,'sizeBytes',v_track.size_bytes,'createdAt',v_track.created_at);
end; $$;

alter table public.meeting_music_tracks enable row level security;
drop policy if exists meeting_music_tracks_authenticated_read on public.meeting_music_tracks;
create policy meeting_music_tracks_authenticated_read on public.meeting_music_tracks for select to authenticated
using (active and public.is_current_session_valid());

drop policy if exists meeting_music_controller_insert on storage.objects;
create policy meeting_music_controller_insert on storage.objects for insert to authenticated
with check (bucket_id='meeting-music' and public.is_meeting_music_controller());
drop policy if exists meeting_music_controller_delete on storage.objects;
create policy meeting_music_controller_delete on storage.objects for delete to authenticated
using (bucket_id='meeting-music' and public.is_meeting_music_controller());

revoke all on function public.is_meeting_music_controller(),public.get_meeting_music_tracks(),
  public.save_meeting_music_track(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.is_meeting_music_controller(),public.get_meeting_music_tracks(),
  public.save_meeting_music_track(uuid,text,text,text,text,bigint) to authenticated;

commit;
