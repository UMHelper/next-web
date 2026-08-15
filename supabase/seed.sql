-- Minimal local seed so a new developer can boot the app without production data.

insert into public.statistics (id, name, course_num, comment_num)
values (1, 'local', 1, 2)
on conflict (id) do update
set
  name = excluded.name,
  course_num = excluded.course_num,
  comment_num = excluded.comment_num;

insert into public.course_noporf (
  "Offering_Unit",
  "Offering_Department",
  "New_code",
  "Old_code",
  "courseTitleEng",
  "courseTitleChi",
  "Credits",
  "Course_Duration",
  "Medium_of_Instruction",
  "Is_Offered",
  "offeringProgLevel",
  "courseType",
  "suggestedYearOfStudy",
  "gradingSystem",
  "courseDescription",
  "ilo"
)
values (
  'FST',
  'Computer and Information Science',
  'COMP-LOCAL-101',
  'COMP-LOCAL-101',
  'Local Development Testing',
  '本地开发测试',
  '3',
  '1 Semester',
  'English',
  1,
  'UG',
  'Lecture',
  1,
  'Letter Grade',
  'Seed course used to verify local setup.',
  'Understand the local bootstrapping flow.'
)
on conflict ("New_code") do update
set
  "courseTitleEng" = excluded."courseTitleEng",
  "courseTitleChi" = excluded."courseTitleChi",
  "courseDescription" = excluded."courseDescription",
  ilo = excluded.ilo,
  "Is_Offered" = excluded."Is_Offered";

insert into public.prof_info (name, temp)
values ('LOCAL TESTER', '')
on conflict (name) do nothing;

insert into public.prof_with_course (
  id,
  result,
  comments,
  attendance,
  grade,
  hard,
  reward,
  course_id,
  prof_id,
  is_offered,
  admin_note,
  admin_note_en
)
values (
  1,
  4.2,
  1,
  4.5,
  4.0,
  2.3,
  4.4,
  'COMP-LOCAL-101',
  'LOCAL TESTER',
  1,
  'Local seed row',
  'Local seed row'
)
on conflict (id) do update
set
  course_id = excluded.course_id,
  prof_id = excluded.prof_id,
  is_offered = excluded.is_offered,
  admin_note = excluded.admin_note,
  admin_note_en = excluded.admin_note_en;

insert into public.offer (id, year, sem, section, course_id)
values (1, 2026, 1, 'A01', 1)
on conflict (id) do update
set
  year = excluded.year,
  sem = excluded.sem,
  section = excluded.section,
  course_id = excluded.course_id;

insert into public.time_location (id, date, times, location)
values (1, 'Mon', '09:00 - 10:15', 'E11-101')
on conflict (id) do update
set
  date = excluded.date,
  times = excluded.times,
  location = excluded.location;

insert into public.schedule (id, course_id, time_location_id)
values (1, 1, 1)
on conflict (id) do update
set
  course_id = excluded.course_id,
  time_location_id = excluded.time_location_id;

insert into public.comment (
  id,
  content,
  attendance,
  pre,
  grade,
  hard,
  reward,
  recommend,
  assignment,
  result,
  pub_time,
  upvote,
  downvote,
  course_id,
  verify,
  verify_account,
  content_en,
  img,
  replyto,
  hidden
)
values
(
  1,
  'Local seed comment for verifying the review page.',
  4.5,
  3.8,
  4.0,
  2.5,
  4.2,
  1.0,
  3.0,
  4.1,
  '2026-08-15 10:00:00',
  1,
  0,
  1,
  1,
  'local-seed',
  'Local seed comment for verifying the review page.',
  null,
  null,
  0
),
(
  2,
  'Local seed reply.',
  0.0,
  0.0,
  0.0,
  0.0,
  0.0,
  0.0,
  0.0,
  0.0,
  '2026-08-15 10:05:00',
  0,
  0,
  1,
  1,
  'local-seed',
  'Local seed reply.',
  null,
  1,
  0
)
on conflict (id) do update
set
  content = excluded.content,
  replyto = excluded.replyto,
  course_id = excluded.course_id,
  hidden = excluded.hidden;

insert into public.vote (created_at, created_by, "offset", comment_id, emoji)
values
  ('2026-08-15 10:06:00', 'local-seed-user', 1, 1, null),
  ('2026-08-15 10:07:00', 'local-seed-user', 0, 1, '🔥')
on conflict do nothing;

select setval('public.prof_with_course_id_seq', greatest((select max(id) from public.prof_with_course), 1), true);
select setval('public.offer_id_seq', greatest((select max(id) from public.offer), 1), true);
select setval('public.time_location_id_seq', greatest((select max(id) from public.time_location), 1), true);
select setval('public.schedule_id_seq', greatest((select max(id) from public.schedule), 1), true);
select setval('public.comment_id_seq', greatest((select max(id) from public.comment), 1), true);

select public.refresh_prof_with_course_stats(1);
