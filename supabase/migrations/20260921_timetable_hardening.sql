-- 1. 规范化存量值
update public.time_location set date = upper(btrim(date)) where date <> upper(btrim(date));
update public.time_location set times = replace(btrim(times), ' ', '') where times <> replace(btrim(times), ' ', '');
update public.time_location set location = btrim(location) where location <> btrim(location);
update public.offer set section = btrim(section) where section <> btrim(section);

-- 2. time_location dedupe（保留最小 id，改指 schedule.time_location_id）
do $$
begin
  create temporary table tmp_time_location_dedupe on commit drop as
  with ranked as (
    select id, date, times, location,
           row_number() over (partition by date, times, location order by id asc) as rn
    from public.time_location
  )
  select keep.id as keep_id, keep.date, keep.times, keep.location,
         array_agg(drop_row.id order by drop_row.id) as drop_ids
  from ranked keep
  join ranked drop_row
    on keep.date = drop_row.date
   and keep.times = drop_row.times
   and keep.location = drop_row.location
  where keep.rn = 1 and drop_row.rn > 1
  group by keep.id, keep.date, keep.times, keep.location;

  update public.schedule s
  set time_location_id = d.keep_id
  from tmp_time_location_dedupe d
  where s.time_location_id = any(d.drop_ids);

  delete from public.time_location t
  using tmp_time_location_dedupe d
  where t.id = any(d.drop_ids);
end $$;

-- 3. offer dedupe（保留最小 id，改指 schedule.course_id）
do $$
begin
  create temporary table tmp_offer_dedupe on commit drop as
  with ranked as (
    select id, course_id, section, year, sem,
           row_number() over (partition by course_id, section, year, sem order by id asc) as rn
    from public.offer
  )
  select keep.id as keep_id, keep.course_id, keep.section, keep.year, keep.sem,
         array_agg(drop_row.id order by drop_row.id) as drop_ids
  from ranked keep
  join ranked drop_row
    on keep.course_id = drop_row.course_id
   and keep.section = drop_row.section
   and keep.year = drop_row.year
   and keep.sem = drop_row.sem
  where keep.rn = 1 and drop_row.rn > 1
  group by keep.id, keep.course_id, keep.section, keep.year, keep.sem;

  update public.schedule s
  set course_id = d.keep_id
  from tmp_offer_dedupe d
  where s.course_id = any(d.drop_ids);

  delete from public.offer o
  using tmp_offer_dedupe d
  where o.id = any(d.drop_ids);
end $$;

-- 4. schedule dedupe
do $$
begin
  create temporary table tmp_schedule_dedupe on commit drop as
  with ranked as (
    select id, row_number() over (partition by course_id, time_location_id order by id asc) as rn
    from public.schedule
  )
  select id from ranked where rn > 1;

  delete from public.schedule s
  using tmp_schedule_dedupe d
  where s.id = d.id;
end $$;

-- 5. 唯一索引
create unique index if not exists time_location_slot_unique_idx on public.time_location (date, times, location);
create unique index if not exists offer_section_unique_idx on public.offer (course_id, section, year, sem);
create unique index if not exists schedule_unique_idx on public.schedule (course_id, time_location_id);

-- 6. CHECK（NOT VALID：不扫描存量，但约束新写入）
alter table public.time_location drop constraint if exists time_location_date_check;
alter table public.time_location
  add constraint time_location_date_check
  check (date in ('MON','TUE','WED','THU','FRI','SAT','SUN')) not valid;

alter table public.time_location drop constraint if exists time_location_times_check;
alter table public.time_location
  add constraint time_location_times_check
  check (times ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

-- 7. 语义注释
comment on column public.offer.course_id is 'references prof_with_course.id (NOT course code)';
comment on column public.schedule.course_id is 'references offer.id (NOT course code)';
comment on column public.time_location.date is 'weekday, uppercase MON..SUN';
comment on column public.time_location.times is 'HH:MM-HH:MM';

notify pgrst, 'reload schema';
