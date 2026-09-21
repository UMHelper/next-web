-- The legacy Python update scripts inserted explicit ids (max(id)+1) without
-- advancing the identity sequences, so the sequences lag behind the data and
-- RPC inserts collide on the primary key. Re-sync all four sequences.
select setval('public.time_location_id_seq', coalesce((select max(id) from public.time_location), 0) + 1, false);
select setval('public.prof_with_course_id_seq', coalesce((select max(id) from public.prof_with_course), 0) + 1, false);
select setval('public.offer_id_seq', coalesce((select max(id) from public.offer), 0) + 1, false);
select setval('public.schedule_id_seq', coalesce((select max(id) from public.schedule), 0) + 1, false);

notify pgrst, 'reload schema';
