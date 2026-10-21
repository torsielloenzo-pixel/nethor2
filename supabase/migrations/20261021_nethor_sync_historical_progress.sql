-- Tableau de bord de l'import historique, visible seulement aux gestionnaires NethorSync.
begin;
create or replace function public.nethor_sync_historical_summary()
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
  v_total integer;
  v_published integer;
  v_rejected integer;
  v_skipped integer;
  v_pending integer;
  v_last timestamptz;
  v_years jsonb;
begin
  if auth.uid() is null or not private.session_is_active()
     or not exists(select 1 from public.profiles p where p.id=auth.uid()
       and p.account_enabled and p.role in ('admin','role_point-de-vente')) then
    raise exception 'NETHOR_SYNC_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select count(*),
    count(*) filter(where status='published'),
    count(*) filter(where status='rejected'),
    count(*) filter(where status='skipped'),
    count(*) filter(where status in ('queued','processing')),
    max(completed_at)
  into v_total,v_published,v_rejected,v_skipped,v_pending,v_last
  from private.nethor_sync_auto_jobs
  where missing_week_only;
  select coalesce(jsonb_agg(jsonb_build_object('year',x.y,'weeks',x.n)
      order by x.y desc),'[]'::jsonb)
  into v_years
  from (select extract(year from week_start)::integer y,count(*) n
        from public.planning_weeks where source_path like 'sync-inbox/%'
        group by 1) x;
  return jsonb_build_object(
    'imported',v_published,'rejected',v_rejected,
    'skipped',v_skipped,'pending',v_pending,'analyzed',v_total,
    'lastProcessedAt',v_last,'years',v_years,
    'mode','historical_and_future');
end
$fn$;
revoke all on function public.nethor_sync_historical_summary()
  from public,anon;
grant execute on function public.nethor_sync_historical_summary()
  to authenticated;
commit;