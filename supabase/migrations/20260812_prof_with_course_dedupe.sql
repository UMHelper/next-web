do $$
declare
  rec record;
begin
  create temporary table tmp_prof_with_course_dedupe on commit drop as
  with ranked as (
    select
      id,
      course_id,
      prof_id,
      is_offered,
      comments,
      row_number() over (
        partition by course_id, prof_id
        order by is_offered desc, comments desc, id asc
      ) as row_num
    from public.prof_with_course
  )
  select
    keep.id as keep_id,
    keep.course_id,
    keep.prof_id,
    array_agg(drop_row.id order by drop_row.id) as drop_ids
  from ranked keep
  join ranked drop_row
    on keep.course_id = drop_row.course_id
   and keep.prof_id = drop_row.prof_id
  where keep.row_num = 1
    and drop_row.row_num > 1
  group by keep.id, keep.course_id, keep.prof_id;

  update public.prof_with_course p
  set
    is_offered = merged.is_offered,
    admin_note = merged.admin_note,
    admin_note_en = merged.admin_note_en
  from (
    select
      d.keep_id,
      max(src.is_offered) as is_offered,
      (array_remove(array_agg(src.admin_note order by src.id), null))[1] as admin_note,
      (array_remove(array_agg(src.admin_note_en order by src.id), null))[1] as admin_note_en
    from tmp_prof_with_course_dedupe d
    join public.prof_with_course src
      on src.id = d.keep_id
      or src.id = any(d.drop_ids)
    group by d.keep_id
  ) merged
  where p.id = merged.keep_id;

  update public.comment c
  set course_id = d.keep_id
  from tmp_prof_with_course_dedupe d
  where c.course_id = any(d.drop_ids);

  delete from public.prof_with_course p
  using tmp_prof_with_course_dedupe d
  where p.id = any(d.drop_ids);

  for rec in
    select keep_id
    from tmp_prof_with_course_dedupe
  loop
    perform public.refresh_prof_with_course_stats(rec.keep_id);
  end loop;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'prof_with_course_course_prof_unique_idx'
  ) then
    create unique index prof_with_course_course_prof_unique_idx
      on public.prof_with_course (course_id, prof_id);
  end if;
end $$;
