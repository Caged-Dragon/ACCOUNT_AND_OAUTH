-- Applied to Supabase project CAGED_DRAGON (2026-11-09).
create or replace function public.login_record_oauth_grant_v2(
  p_user_id uuid, p_oauth_client_id text, p_redirect_uri text, p_user_agent text default null
) returns void language plpgsql security definer set search_path = '' as $function$
declare app_id uuid;
begin
  if p_user_id is null or p_oauth_client_id is null or p_redirect_uri is null then raise exception 'invalid oauth grant'; end if;
  select c.id into app_id from public.login_client_apps c
    where c.is_active and c.oauth_client_id=p_oauth_client_id and p_redirect_uri=any(c.redirect_uris) limit 1;
  if app_id is null then return; end if;
  insert into public.login_app_grants(user_id,client_app_id) values(p_user_id,app_id)
    on conflict(user_id,client_app_id) do update set last_used_at=pg_catalog.now();
  insert into public.login_events(user_id,client_app_id,method,user_agent,role)
    values(p_user_id,app_id,'oauth',pg_catalog.left(coalesce(p_user_agent,''),300),'user');
end;
$function$;
revoke all on function public.login_record_oauth_grant_v2(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.login_record_oauth_grant_v2(uuid,text,text,text) to service_role;
