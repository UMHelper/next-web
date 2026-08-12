do $$
declare
  rec record;
begin
  drop index if exists public.prof_with_course_course_prof_unique_idx;

  create temporary table tmp_prof_with_course_trim_dedupe on commit drop as
  with ranked as (
    select
      id,
      course_id,
      prof_id,
      btrim(prof_id) as normalized_prof_id,
      is_offered,
      comments,
      row_number() over (
        partition by course_id, btrim(prof_id)
        order by is_offered desc, comments desc, id asc
      ) as row_num
    from public.prof_with_course
  )
  select
    keep.id as keep_id,
    keep.course_id,
    keep.normalized_prof_id,
    array_agg(drop_row.id order by drop_row.id) as drop_ids
  from ranked keep
  join ranked drop_row
    on keep.course_id = drop_row.course_id
   and keep.normalized_prof_id = drop_row.normalized_prof_id
  where keep.row_num = 1
    and drop_row.row_num > 1
  group by keep.id, keep.course_id, keep.normalized_prof_id;

  update public.prof_with_course p
  set
    prof_id = merged.normalized_prof_id,
    is_offered = merged.is_offered,
    admin_note = merged.admin_note,
    admin_note_en = merged.admin_note_en
  from (
    select
      d.keep_id,
      d.normalized_prof_id,
      max(src.is_offered) as is_offered,
      (array_remove(array_agg(src.admin_note order by src.id), null))[1] as admin_note,
      (array_remove(array_agg(src.admin_note_en order by src.id), null))[1] as admin_note_en
    from tmp_prof_with_course_trim_dedupe d
    join public.prof_with_course src
      on src.id = d.keep_id
      or src.id = any(d.drop_ids)
    group by d.keep_id, d.normalized_prof_id
  ) merged
  where p.id = merged.keep_id;

  update public.comment c
  set course_id = d.keep_id
  from tmp_prof_with_course_trim_dedupe d
  where c.course_id = any(d.drop_ids);

  delete from public.prof_with_course p
  using tmp_prof_with_course_trim_dedupe d
  where p.id = any(d.drop_ids);

  update public.prof_with_course
  set prof_id = btrim(prof_id)
  where prof_id <> btrim(prof_id);

  for rec in
    select distinct keep_id
    from tmp_prof_with_course_trim_dedupe
  loop
    perform public.refresh_prof_with_course_stats(rec.keep_id);
  end loop;

  create unique index if not exists prof_with_course_course_prof_unique_idx
    on public.prof_with_course (course_id, prof_id);
end $$;

do $$
begin
  create temporary table tmp_prof_info_trim_dedupe on commit drop as
  with ranked as (
    select
      ctid as row_ctid,
      name,
      btrim(name) as normalized_name,
      row_number() over (
        partition by btrim(name)
        order by name asc, ctid
      ) as row_num
    from public.prof_info
  )
  select row_ctid
  from ranked
  where row_num > 1;

  delete from public.prof_info
  where ctid in (
    select row_ctid
    from tmp_prof_info_trim_dedupe
  );

  update public.prof_info
  set name = btrim(name)
  where name <> btrim(name);
end $$;

create or replace function public.normalize_prof_with_course_prof_id()
returns trigger
language plpgsql
as $function$
begin
  new.prof_id := btrim(new.prof_id);
  return new;
end;
$function$;

create or replace function public.normalize_prof_info_name()
returns trigger
language plpgsql
as $function$
begin
  new.name := btrim(new.name);
  return new;
end;
$function$;

drop trigger if exists trg_normalize_prof_with_course_prof_id on public.prof_with_course;
create trigger trg_normalize_prof_with_course_prof_id
before insert or update on public.prof_with_course
for each row
execute function public.normalize_prof_with_course_prof_id();

drop trigger if exists trg_normalize_prof_info_name on public.prof_info;
create trigger trg_normalize_prof_info_name
before insert or update on public.prof_info
for each row
execute function public.normalize_prof_info_name();
