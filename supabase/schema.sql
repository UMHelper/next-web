-- Local bootstrap schema for UMHelper Next Web
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 15.1 (Ubuntu 15.1-1.pgdg20.04+1)
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment (
    id bigint NOT NULL,
    content text,
    attendance double precision NOT NULL,
    pre double precision NOT NULL,
    grade double precision NOT NULL,
    hard double precision NOT NULL,
    reward double precision NOT NULL,
    recommend double precision NOT NULL,
    assignment double precision NOT NULL,
    result double precision NOT NULL,
    pub_time timestamp without time zone NOT NULL,
    upvote integer DEFAULT 0 NOT NULL,
    downvote integer DEFAULT 0 NOT NULL,
    course_id integer NOT NULL,
    verify integer DEFAULT 0 NOT NULL,
    verify_account character varying(100) DEFAULT ''::character varying NOT NULL,
    content_en text,
    img text,
    replyto bigint,
    hidden smallint DEFAULT '0'::smallint
);


--
-- Name: get_comment_list(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_comment_list(course_code text, prof text) RETURNS SETOF public.comment
    LANGUAGE sql
    AS $$select
  *
from
comment
where
  course_id in (
    select
      id
    from
      prof_with_course
    where
      course_id = course_code
      and prof_id = prof
  )$$;


--
-- Name: get_comment_page(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_comment_page(target_course_id integer, target_page integer, target_page_size integer DEFAULT 20) RETURNS TABLE(id bigint, content text, attendance double precision, pre double precision, grade double precision, hard double precision, reward double precision, recommend double precision, assignment double precision, result double precision, pub_time timestamp without time zone, upvote integer, downvote integer, course_id integer, verify integer, verify_account character varying, content_en text, img text, replyto bigint, hidden smallint, vote_history jsonb)
    LANGUAGE sql STABLE
    AS $$
with page_comments as (
  select c.*
  from public.comment c
  where c.course_id = target_course_id
    and c.hidden <> 1
    and c.replyto is null
  order by c.pub_time desc
  limit target_page_size
  offset greatest(target_page, 0) * target_page_size
),
thread_comments as (
  select p.*
  from page_comments p
  union all
  select c.*
  from public.comment c
  join page_comments p
    on c.replyto = p.id
  where c.hidden <> 1
)
select
  c.id,
  c.content,
  c.attendance,
  c.pre,
  c.grade,
  c.hard,
  c.reward,
  c.recommend,
  c.assignment,
  c.result,
  c.pub_time,
  c.upvote,
  c.downvote,
  c.course_id,
  c.verify,
  c.verify_account,
  c.content_en,
  c.img,
  c.replyto,
  c.hidden,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'comment_id', v.comment_id,
        'offset', v."offset",
        'created_by', v.created_by,
        'created_at', v.created_at,
        'emoji', v.emoji
      )
      order by v.created_at asc
    ) filter (where v.comment_id is not null),
    '[]'::jsonb
  ) as vote_history
from thread_comments c
left join public.vote v
  on v.comment_id = c.id
group by
  c.id,
  c.content,
  c.attendance,
  c.pre,
  c.grade,
  c.hard,
  c.reward,
  c.recommend,
  c.assignment,
  c.result,
  c.pub_time,
  c.upvote,
  c.downvote,
  c.course_id,
  c.verify,
  c.verify_account,
  c.content_en,
  c.img,
  c.replyto,
  c.hidden
order by
  case when c.replyto is null then 0 else 1 end,
  c.pub_time desc,
  c.id asc;
$$;


--
-- Name: course_noporf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_noporf (
    "Offering_Unit" character varying(100) NOT NULL,
    "Offering_Department" character varying(100) NOT NULL,
    "New_code" character varying(100) NOT NULL,
    "Old_code" character varying(100) NOT NULL,
    "courseTitleEng" character varying(100) NOT NULL,
    "courseTitleChi" character varying(100) NOT NULL,
    "Credits" character varying(100) NOT NULL,
    "Course_Duration" character varying(100) NOT NULL,
    "Medium_of_Instruction" character varying(100) NOT NULL,
    "Is_Offered" smallint NOT NULL,
    "offeringProgLevel" text,
    "courseType" text,
    "suggestedYearOfStudy" numeric,
    "gradingSystem" text,
    "courseDescription" text,
    ilo text
);


--
-- Name: get_course_list_by_prof(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_course_list_by_prof(prof text) RETURNS SETOF public.course_noporf
    LANGUAGE sql
    AS $$
select
  *
from
course_noporf
where
  "New_code" in (
    select
      course_id
    from
      prof_with_course
    where
      prof_id = prof
  )
$$;


--
-- Name: offer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer (
    id integer NOT NULL,
    year integer NOT NULL,
    sem integer NOT NULL,
    section character varying(1024) NOT NULL,
    course_id integer NOT NULL
);


--
-- Name: get_offer_list_by_prof(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_offer_list_by_prof(course_code text, prof text) RETURNS SETOF public.offer
    LANGUAGE sql
    AS $$
select *
from offer
where
course_id in (
select
  id
from
prof_with_course
where
  course_id = course_code and prof_id=prof)
$$;


--
-- Name: get_prof_course_id(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_prof_course_id(input_course_code text, input_prof_id text) RETURNS TABLE(id integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY 
    SELECT prof_with_course.id
    FROM   course_noporf
    JOIN   prof_with_course
    ON     course_noporf."New_code" = prof_with_course.course_id
    WHERE  course_noporf."New_code" = input_course_code
    AND    prof_with_course.prof_id = input_prof_id;
END;
$$;


--
-- Name: get_schedule_list(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_schedule_list(course_code text, prof text) RETURNS TABLE(year integer, sem integer, section text, date text, times text, location text)
    LANGUAGE sql
    AS $$select year,sem,section,date,times,location
from
((
  select *
from
get_offer_list_by_prof(course_code,prof)
) tb1
left outer 
join schedule
on tb1.id=schedule.course_id) tb2
join time_location
on tb2.time_location_id=time_location.id$$;


--
-- Name: insert_comment_and_refresh_prof_stats(integer, text, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, timestamp without time zone, integer, character varying, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_comment_and_refresh_prof_stats(target_course_id integer, target_content text, target_attendance double precision, target_pre double precision, target_grade double precision, target_hard double precision, target_reward double precision, target_recommend double precision, target_assignment double precision, target_result double precision, target_pub_time timestamp without time zone, target_verify integer, target_verify_account character varying, target_img text DEFAULT NULL::text) RETURNS public.comment
    LANGUAGE plpgsql
    AS $$
declare
  inserted_comment public.comment;
  locked_course_id integer;
begin
  select id
    into locked_course_id
  from public.prof_with_course
  where id = target_course_id
  for update;

  if locked_course_id is null then
    raise exception 'prof_with_course id % not found', target_course_id;
  end if;

  insert into public.comment (
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
    img
  )
  values (
    target_content,
    target_attendance,
    target_pre,
    target_grade,
    target_hard,
    target_reward,
    target_recommend,
    target_assignment,
    target_result,
    target_pub_time,
    0,
    0,
    target_course_id,
    target_verify,
    target_verify_account,
    target_img
  )
  returning *
  into inserted_comment;

  perform public.refresh_prof_with_course_stats(target_course_id);

  return inserted_comment;
end;
$$;


--
-- Name: normalize_prof_info_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_prof_info_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.name := btrim(new.name);
  return new;
end;
$$;


--
-- Name: normalize_prof_with_course_prof_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_prof_with_course_prof_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.prof_id := btrim(new.prof_id);
  return new;
end;
$$;


--
-- Name: refresh_prof_with_course_stats(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_prof_with_course_stats(target_course_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  locked_course_id integer;
begin
  select id
    into locked_course_id
  from public.prof_with_course
  where id = target_course_id
  for update;

  if locked_course_id is null then
    raise exception 'prof_with_course id % not found', target_course_id;
  end if;

  update public.prof_with_course as p
  set
    comments = coalesce(stats.comments, 0),
    result = coalesce(stats.result, 0),
    attendance = coalesce(stats.attendance, 0),
    grade = coalesce(stats.grade, 0),
    hard = coalesce(stats.hard, 0),
    reward = coalesce(stats.reward, 0)
  from (
    select
      count(*)::integer as comments,
      avg(c.result)::real as result,
      avg(c.attendance)::real as attendance,
      avg(c.grade)::real as grade,
      avg(c.hard)::real as hard,
      avg(c.reward)::real as reward
    from public.comment as c
    where c.course_id = target_course_id
      and c.replyto is null
      and c.hidden <> 1
  ) as stats
  where p.id = target_course_id;
end;
$$;


--
-- Name: search_courses(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_courses(keyword text) RETURNS SETOF public.course_noporf
    LANGUAGE sql STABLE
    AS $$
  select distinct on (c."New_code")
    c.*
  from public.course_noporf c
  where c."New_code" ilike '%' || keyword || '%'
     or c."courseTitleEng" ilike '%' || replace(keyword, '%20', ' ') || '%'
  order by c."New_code";
$$;


--
-- Name: search_instructors_with_courses(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_instructors_with_courses(keyword text) RETURNS TABLE(prof_name text, course_list jsonb)
    LANGUAGE sql STABLE
    AS $_$
with normalized_professors as (
  select trim(p.name) as normalized_name
  from public.prof_info p
  where trim(p.name) ilike '%' || replace(replace(keyword, '%20', ' '), '$', '/') || '%'
  group by trim(p.name)
)
select
  np.normalized_name as prof_name,
  coalesce(
    jsonb_agg(to_jsonb(c) order by c."New_code") filter (where c."New_code" is not null),
    '[]'::jsonb
  ) as course_list
from normalized_professors np
left join public.prof_with_course pwc
  on trim(pwc.prof_id) = np.normalized_name
left join public.course_noporf c
  on c."New_code" = pwc.course_id
group by np.normalized_name
order by np.normalized_name asc;
$_$;


--
-- Name: comment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comment ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.comment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: offer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.offer ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.offer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prof_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prof_info (
    name character varying(200) NOT NULL,
    temp character varying(100) NOT NULL
);


--
-- Name: prof_with_course; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prof_with_course (
    id integer NOT NULL,
    result real DEFAULT '0'::real NOT NULL,
    comments integer DEFAULT 0 NOT NULL,
    attendance real DEFAULT '0'::real NOT NULL,
    grade real DEFAULT '0'::real NOT NULL,
    hard real DEFAULT '0'::real NOT NULL,
    reward real DEFAULT '0'::real NOT NULL,
    course_id character varying(100) NOT NULL,
    prof_id character varying(200) NOT NULL,
    is_offered integer DEFAULT 0 NOT NULL,
    admin_note text,
    admin_note_en text
);


--
-- Name: prof_with_course_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prof_with_course ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.prof_with_course_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule (
    id integer NOT NULL,
    course_id integer NOT NULL,
    time_location_id integer NOT NULL
);


--
-- Name: schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schedule ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.schedule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: statistics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.statistics (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    course_num integer NOT NULL,
    comment_num integer NOT NULL
);


--
-- Name: time_location; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_location (
    id integer NOT NULL,
    date character varying(1024) NOT NULL,
    times character varying(1024) NOT NULL,
    location character varying(1024) NOT NULL
);


--
-- Name: time_location_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.time_location ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.time_location_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote (
    created_at timestamp without time zone NOT NULL,
    created_by text NOT NULL,
    "offset" smallint NOT NULL,
    comment_id bigint NOT NULL,
    emoji text
);


--
-- Name: COLUMN vote."offset"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vote."offset" IS 'deprecated';


--
-- Name: comment comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_id_key UNIQUE (id);


--
-- Name: comment comment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment
    ADD CONSTRAINT comment_pkey PRIMARY KEY (id);


--
-- Name: course_noporf course_noporf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_noporf
    ADD CONSTRAINT course_noporf_pkey PRIMARY KEY ("New_code");


--
-- Name: offer offer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_id_key UNIQUE (id);


--
-- Name: offer offer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_pkey PRIMARY KEY (id);


--
-- Name: prof_info prof_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prof_info
    ADD CONSTRAINT prof_info_pkey PRIMARY KEY (name);


--
-- Name: prof_with_course prof_with_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prof_with_course
    ADD CONSTRAINT prof_with_course_id_key UNIQUE (id);


--
-- Name: prof_with_course prof_with_course_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prof_with_course
    ADD CONSTRAINT prof_with_course_pkey PRIMARY KEY (id);


--
-- Name: schedule schedule_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_id_key UNIQUE (id);


--
-- Name: schedule schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_pkey PRIMARY KEY (id);


--
-- Name: statistics statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statistics
    ADD CONSTRAINT statistics_pkey PRIMARY KEY (id);


--
-- Name: time_location time_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_location
    ADD CONSTRAINT time_location_id_key UNIQUE (id);


--
-- Name: time_location time_location_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_location
    ADD CONSTRAINT time_location_pkey PRIMARY KEY (id);


--
-- Name: comment_course_id_visible_top_level_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_course_id_visible_top_level_idx ON public.comment USING btree (course_id) WHERE ((replyto IS NULL) AND (hidden <> 1));


--
-- Name: comment_replyto_visible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_replyto_visible_idx ON public.comment USING btree (replyto) WHERE (hidden <> 1);


--
-- Name: course_comment_course_id_24187967_fk_course_prof_with_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_comment_course_id_24187967_fk_course_prof_with_course_id ON public.comment USING btree (course_id);


--
-- Name: course_noporf_code_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_noporf_code_trgm_idx ON public.course_noporf USING gin ("New_code" extensions.gin_trgm_ops);


--
-- Name: course_noporf_title_eng_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_noporf_title_eng_trgm_idx ON public.course_noporf USING gin ("courseTitleEng" extensions.gin_trgm_ops);


--
-- Name: course_offer_course_id_92ab301f_fk_course_prof_with_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_offer_course_id_92ab301f_fk_course_prof_with_course_id ON public.offer USING btree (course_id);


--
-- Name: course_prof_with_cou_course_id_dd160e45_fk_course_co; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_prof_with_cou_course_id_dd160e45_fk_course_co ON public.prof_with_course USING btree (course_id);


--
-- Name: course_prof_with_cou_prof_id_8150f008_fk_course_pr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_prof_with_cou_prof_id_8150f008_fk_course_pr ON public.prof_with_course USING btree (prof_id);


--
-- Name: course_schedule_course_id_f2350d3a_fk_course_offer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_schedule_course_id_f2350d3a_fk_course_offer_id ON public.schedule USING btree (course_id);


--
-- Name: course_schedule_time_location_id_2b3623d1_fk_course_ti; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_schedule_time_location_id_2b3623d1_fk_course_ti ON public.schedule USING btree (time_location_id);


--
-- Name: course_vote_comment_id_0d1050f1_fk_course_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX course_vote_comment_id_0d1050f1_fk_course_comment_id ON public.vote USING btree (comment_id);


--
-- Name: prof_with_course_course_prof_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prof_with_course_course_prof_idx ON public.prof_with_course USING btree (course_id, prof_id);


--
-- Name: prof_with_course_course_prof_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prof_with_course_course_prof_unique_idx ON public.prof_with_course USING btree (course_id, prof_id);


--
-- Name: vote_unique_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vote_unique_direction_idx ON public.vote USING btree (comment_id, created_by) WHERE ("offset" <> 0);


--
-- Name: vote_unique_reaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vote_unique_reaction_idx ON public.vote USING btree (comment_id, created_by, emoji) WHERE (("offset" = 0) AND (emoji IS NOT NULL));


--
-- Name: prof_info trg_normalize_prof_info_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_prof_info_name BEFORE INSERT OR UPDATE ON public.prof_info FOR EACH ROW EXECUTE FUNCTION public.normalize_prof_info_name();


--
-- Name: prof_with_course trg_normalize_prof_with_course_prof_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_prof_with_course_prof_id BEFORE INSERT OR UPDATE ON public.prof_with_course FOR EACH ROW EXECUTE FUNCTION public.normalize_prof_with_course_prof_id();


--
-- Name: comment course_comment_course_id_24187967_fk_course_prof_with_course_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment
    ADD CONSTRAINT course_comment_course_id_24187967_fk_course_prof_with_course_id FOREIGN KEY (course_id) REFERENCES public.prof_with_course(id);


--
-- Name: prof_with_course course_prof_with_cou_course_id_dd160e45_fk_course_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prof_with_course
    ADD CONSTRAINT course_prof_with_cou_course_id_dd160e45_fk_course_co FOREIGN KEY (course_id) REFERENCES public.course_noporf("New_code");


--
-- Name: schedule course_schedule_course_id_f2350d3a_fk_course_offer_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT course_schedule_course_id_f2350d3a_fk_course_offer_id FOREIGN KEY (course_id) REFERENCES public.offer(id);


--
-- Name: schedule course_schedule_time_location_id_2b3623d1_fk_course_ti; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT course_schedule_time_location_id_2b3623d1_fk_course_ti FOREIGN KEY (time_location_id) REFERENCES public.time_location(id);


--
-- Name: prof_with_course prof_with_course_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prof_with_course
    ADD CONSTRAINT prof_with_course_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course_noporf("New_code");


--
-- PostgreSQL database dump complete
--



--
-- App config (migration: 20260921_app_config.sql)
--

create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  current_year integer not null,
  current_sem integer not null check (current_sem in (1, 2)),
  is_preenrollment_open boolean not null default true,
  database_last_update date,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_config (id, current_year, current_sem, is_preenrollment_open, database_last_update)
values (1, 2026, 1, true, current_date)
on conflict (id) do nothing;

--
-- Timetable hardening (migration: 20260921_timetable_hardening.sql)
--

create unique index if not exists time_location_slot_unique_idx on public.time_location (date, times, location);
create unique index if not exists offer_section_unique_idx on public.offer (course_id, section, year, sem);
create unique index if not exists schedule_unique_idx on public.schedule (course_id, time_location_id);

alter table public.time_location drop constraint if exists time_location_date_check;
alter table public.time_location
  add constraint time_location_date_check
  check (date in ('MON','TUE','WED','THU','FRI','SAT','SUN')) not valid;

alter table public.time_location drop constraint if exists time_location_times_check;
alter table public.time_location
  add constraint time_location_times_check
  check (times ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

comment on column public.offer.course_id is 'references prof_with_course.id (NOT course code)';
comment on column public.schedule.course_id is 'references offer.id (NOT course code)';
comment on column public.time_location.date is 'weekday, uppercase MON..SUN';
comment on column public.time_location.times is 'HH:MM-HH:MM';

--
-- get_schedule_list term filter (migration: 20260921_get_schedule_list.sql)
--

drop function if exists public.get_schedule_list(text, text);

create or replace function public.get_schedule_list(
  course_code text,
  prof text,
  target_year integer,
  target_sem integer
)
returns table (year integer, sem integer, section text, date text, times text, location text)
language sql
stable
security invoker
set search_path = public
as $function$
  select o.year, o.sem, o.section, tl.date, tl.times, tl.location
  from public.get_offer_list_by_prof(course_code, prof) o
  join public.schedule s on s.course_id = o.id
  join public.time_location tl on tl.id = s.time_location_id
  where o.year = target_year and o.sem = target_sem
  order by o.section, tl.date, tl.times, tl.location;
$function$;

--
-- Update pipeline RPCs (migration: 20260921_update_rpcs.sql)
--
create or replace function public.admin_reset_offered()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  course_rows integer;
  prof_rows integer;
begin
  update public.course_noporf set "Is_Offered" = 0 where "New_code" <> '';
  get diagnostics course_rows = row_count;
  update public.prof_with_course set is_offered = 0 where course_id <> '';
  get diagnostics prof_rows = row_count;
  return jsonb_build_object('course_noporf', course_rows, 'prof_with_course', prof_rows);
end;
$function$;

create or replace function public.admin_resolve_known_codes(codes text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(array_agg("New_code"), '{}'::text[])
  from public.course_noporf
  where "New_code" = any(codes);
$function$;

create or replace function public.admin_mark_offered(codes text[])
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  affected integer;
begin
  update public.course_noporf set "Is_Offered" = 1 where "New_code" = any(codes);
  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.admin_upsert_offered_courses(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  upserted integer := 0;
  marked integer := 0;
begin
  insert into public.course_noporf (
    "Offering_Unit", "Offering_Department", "New_code", "Old_code",
    "courseTitleEng", "courseTitleChi", "Credits", "Course_Duration",
    "Medium_of_Instruction", "Is_Offered", "offeringProgLevel", "courseType",
    "suggestedYearOfStudy", "gradingSystem", "courseDescription", ilo
  )
  select
    coalesce(x."Offering_Unit", ''),
    coalesce(x."Offering_Department", ''),
    upper(btrim(x."New_code")),
    coalesce(x."Old_code", ''),
    coalesce(x."courseTitleEng", ''),
    coalesce(x."courseTitleChi", ''),
    coalesce(x."Credits", ''),
    coalesce(x."Course_Duration", ''),
    coalesce(x."Medium_of_Instruction", ''),
    1,
    x."offeringProgLevel",
    x."courseType",
    x."suggestedYearOfStudy",
    x."gradingSystem",
    x."courseDescription",
    x.ilo
  from jsonb_to_recordset(coalesce(payload->'inserts', '[]'::jsonb)) as x(
    "Offering_Unit" text, "Offering_Department" text, "New_code" text, "Old_code" text,
    "courseTitleEng" text, "courseTitleChi" text, "Credits" text, "Course_Duration" text,
    "Medium_of_Instruction" text, "offeringProgLevel" text, "courseType" text,
    "suggestedYearOfStudy" numeric, "gradingSystem" text, "courseDescription" text, ilo text
  )
  where coalesce(x."New_code", '') <> ''
  on conflict ("New_code") do update set "Is_Offered" = 1;
  get diagnostics upserted = row_count;

  update public.course_noporf set "Is_Offered" = 1
  where "New_code" = any (
    select value from jsonb_array_elements_text(coalesce(payload->'offered_codes', '[]'::jsonb))
  );
  get diagnostics marked = row_count;

  return jsonb_build_object('upserted', upserted, 'marked', marked);
end;
$function$;

create or replace function public.admin_apply_schedule(payload jsonb, scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_year integer := nullif(payload->>'year', '')::integer;
  target_sem integer := nullif(payload->>'sem', '')::integer;
  tl_rows integer := 0;
  pwc_rows integer := 0;
  offer_rows integer := 0;
  sched_rows integer := 0;
begin
  if scope not in ('time_location', 'prof_course', 'offer', 'all') then
    raise exception 'invalid scope: %', scope;
  end if;

  if scope in ('offer', 'all') and (target_year is null or target_sem is null) then
    raise exception 'year and sem are required for scope %', scope;
  end if;

  with rows as (
    select distinct
      upper(btrim(r->>'day')) as date,
      replace(btrim(r->>'times'), ' ', '') as times,
      btrim(r->>'location') as location
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.time_location (date, times, location)
    select date, times, location from rows
    on conflict (date, times, location) do nothing
    returning 1
  )
  select count(*) into tl_rows from ins;

  if scope = 'time_location' then
    return jsonb_build_object('time_location', tl_rows);
  end if;

  with rows as (
    select distinct btrim(r->>'code') as course_id, btrim(r->>'prof') as prof_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'code', '') <> '' and coalesce(r->>'prof', '') <> ''
  ), ins as (
    insert into public.prof_with_course (course_id, prof_id, is_offered)
    select course_id, prof_id, 1 from rows
    on conflict (course_id, prof_id) do update set is_offered = 1
    returning 1
  )
  select count(*) into pwc_rows from ins;

  if scope = 'prof_course' then
    return jsonb_build_object('prof_with_course', pwc_rows);
  end if;

  with rows as (
    select distinct p.id as pwc_id, btrim(r->>'section') as section
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = btrim(r->>'code') and p.prof_id = btrim(r->>'prof')
    where coalesce(r->>'section', '') <> ''
  ), ins as (
    insert into public.offer (course_id, section, year, sem)
    select pwc_id, section, target_year, target_sem from rows
    on conflict (course_id, section, year, sem) do nothing
    returning 1
  )
  select count(*) into offer_rows from ins;

  with rows as (
    select distinct o.id as offer_id, tl.id as tl_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = btrim(r->>'code') and p.prof_id = btrim(r->>'prof')
    join public.offer o
      on o.course_id = p.id and o.section = btrim(r->>'section')
     and o.year = target_year and o.sem = target_sem
    join public.time_location tl
      on tl.date = upper(btrim(r->>'day'))
     and tl.times = replace(btrim(r->>'times'), ' ', '')
     and tl.location = btrim(r->>'location')
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.schedule (course_id, time_location_id)
    select offer_id, tl_id from rows
    on conflict (course_id, time_location_id) do nothing
    returning 1
  )
  select count(*) into sched_rows from ins;

  return jsonb_build_object(
    'time_location', tl_rows,
    'prof_with_course', pwc_rows,
    'offer', offer_rows,
    'schedule', sched_rows
  );
end;
$function$;

revoke all on function public.admin_reset_offered() from public, anon, authenticated;
revoke all on function public.admin_resolve_known_codes(text[]) from public, anon, authenticated;
revoke all on function public.admin_mark_offered(text[]) from public, anon, authenticated;
revoke all on function public.admin_upsert_offered_courses(jsonb) from public, anon, authenticated;
revoke all on function public.admin_apply_schedule(jsonb, text) from public, anon, authenticated;

grant execute on function public.admin_reset_offered() to service_role;
grant execute on function public.admin_resolve_known_codes(text[]) to service_role;
grant execute on function public.admin_mark_offered(text[]) to service_role;
grant execute on function public.admin_upsert_offered_courses(jsonb) to service_role;
grant execute on function public.admin_apply_schedule(jsonb, text) to service_role;

notify pgrst, 'reload schema';

--
-- Course code equivalences (migration: 20261024_course_equivalences.sql)
--

-- Course code equivalence tracking.
--
-- UM renames course codes (for example CISC1001 -> CSCI1001) while the old
-- catalog row keeps all historical reviews / instructor aggregates. The new
-- code is the primary code shown to users; the old code is stored here as an
-- equivalent code so reads can merge the two without moving comment data.
--
-- TLL <code>C / <code>P pairs intentionally share one old LAWS code, so the
-- table is many-to-many and (primary_code, equivalent_code) is unique.

create table if not exists public.course_equivalences (
  id              bigint generated always as identity primary key,
  primary_code    text not null references public.course_noporf("New_code") on update cascade on delete cascade,
  equivalent_code text not null references public.course_noporf("New_code") on update cascade on delete cascade,
  relation        text not null default 'code_change',
  confidence      numeric(4,3),
  source          text not null default 'manual',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint course_equivalences_pair_key unique (primary_code, equivalent_code),
  constraint course_equivalences_not_self check (primary_code <> equivalent_code)
);

create index if not exists course_equivalences_equivalent_idx
  on public.course_equivalences (equivalent_code);

create or replace function public.course_equivalences_guard()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  -- A code is either a primary or an equivalent, never both. This keeps the
  -- grouping flat (one hop) and prevents cycles such as A -> B -> C -> A.
  if exists (
    select 1 from public.course_equivalences e
    where e.equivalent_code = new.primary_code
      and (tg_op = 'INSERT' or e.id <> new.id)
  ) then
    raise exception 'course % is already an equivalent code', new.primary_code;
  end if;

  if exists (
    select 1 from public.course_equivalences e
    where e.primary_code = new.equivalent_code
      and (tg_op = 'INSERT' or e.id <> new.id)
  ) then
    raise exception 'course % is already a primary code', new.equivalent_code;
  end if;

  return new;
end;
$function$;

drop trigger if exists course_equivalences_guard on public.course_equivalences;
create trigger course_equivalences_guard
  before insert or update on public.course_equivalences
  for each row execute function public.course_equivalences_guard();

create or replace function public.resolve_course_code(p_code text)
returns text
language sql
stable
security invoker
set search_path = public
as $function$
  with normalized as (
    select upper(btrim(coalesce(p_code, ''))) as code
  )
  select coalesce(
    (
      select e.primary_code
      from public.course_equivalences e, normalized n
      where e.equivalent_code = n.code
      order by e.primary_code
      limit 1
    ),
    n.code
  )
  from normalized n;
$function$;

create or replace function public.course_group_codes(p_code text)
returns text[]
language sql
stable
security invoker
set search_path = public
as $function$
  with prim as (
    select public.resolve_course_code(p_code) as code
  )
  select array_prepend(
    p.code,
    coalesce(
      (
        select array_agg(e.equivalent_code order by e.equivalent_code)
        from public.course_equivalences e
        where e.primary_code = p.code
      ),
      '{}'::text[]
    )
  )
  from prim p;
$function$;

-- The public catalog only exposes primary codes. Equivalents are attached as
-- an array so cards/pages can render "NEW a.k.a OLD" without an extra query.
create or replace view public.course_catalog
with (security_invoker = true)
as
select
  c.*,
  coalesce(
    (
      select array_agg(e.equivalent_code order by e.equivalent_code)
      from public.course_equivalences e
      where e.primary_code = c."New_code"
    ),
    '{}'::text[]
  ) as equivalent_codes
from public.course_noporf c
where not exists (
  select 1
  from public.course_equivalences e
  where e.equivalent_code = c."New_code"
);

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------

drop function if exists public.search_courses(text);

create function public.search_courses(keyword text)
returns setof public.course_catalog
language sql
stable
security invoker
set search_path = public
as $function$
  select distinct on (c."New_code") c.*
  from public.course_catalog c
  where c."New_code" ilike '%' || keyword || '%'
     or c."courseTitleEng" ilike '%' || replace(keyword, '%20', ' ') || '%'
     or exists (
       select 1
       from unnest(c.equivalent_codes) eq(code)
       where eq.code ilike '%' || keyword || '%'
     )
  order by c."New_code";
$function$;

drop function if exists public.search_planner_courses(text, text, text, integer, integer);

create function public.search_planner_courses(
  keyword text,
  faculty text,
  department text,
  page_limit integer,
  page_offset integer
) returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  offering_department text,
  credits text,
  is_offered integer,
  equivalent_codes text[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      c.*,
      count(*) over() as total_count
    from public.course_catalog c
    where (
      keyword is null
      or btrim(keyword) = ''
      or c."New_code" ilike '%' || btrim(keyword) || '%'
      or c."courseTitleEng" ilike '%' || btrim(keyword) || '%'
      or c."courseTitleChi" ilike '%' || btrim(keyword) || '%'
      or exists (
        select 1
        from unnest(c.equivalent_codes) eq(code)
        where eq.code ilike '%' || btrim(keyword) || '%'
      )
    )
      and (
        faculty is null
        or btrim(faculty) = ''
        or btrim(faculty) = 'All'
        or c."Offering_Unit" = btrim(faculty)
      )
      and (
        department is null
        or btrim(department) = ''
        or btrim(department) = 'All'
        or c."Offering_Department" = btrim(department)
      )
    order by c."New_code"
    limit greatest(page_limit, 1)
    offset greatest(page_offset, 0)
  )
  select
    c."New_code",
    c."courseTitleEng",
    c."courseTitleChi",
    c."Offering_Unit",
    c."Offering_Department",
    c."Credits",
    c."Is_Offered",
    c.equivalent_codes,
    c.total_count
  from filtered c;
$$;

create or replace function public.search_planner_instructors(
  keyword text,
  faculty text,
  department text,
  page_limit integer,
  page_offset integer
) returns table (
  prof_id text,
  course_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with matched as (
    select
      p.prof_id,
      count(distinct c."New_code") as course_count
    from public.prof_with_course p
    join public.course_noporf c
      on c."New_code" = public.resolve_course_code(p.course_id)
    where (
      keyword is null
      or btrim(keyword) = ''
      or p.prof_id ilike '%' || btrim(keyword) || '%'
    )
      and (
        faculty is null
        or btrim(faculty) = ''
        or btrim(faculty) = 'All'
        or c."Offering_Unit" = btrim(faculty)
      )
      and (
        department is null
        or btrim(department) = ''
        or btrim(department) = 'All'
        or c."Offering_Department" = btrim(department)
      )
    group by p.prof_id
  )
  select
    m.prof_id,
    m.course_count,
    count(*) over() as total_count
  from matched m
  order by m.prof_id
  limit greatest(page_limit, 1)
  offset greatest(page_offset, 0);
$$;

create or replace function public.get_course_list_by_prof(prof text)
returns setof public.course_noporf
language sql
stable
security invoker
set search_path = public
as $function$
  select distinct on (c."New_code") c.*
  from public.course_noporf c
  where c."New_code" in (
    select public.resolve_course_code(p.course_id)
    from public.prof_with_course p
    where p.prof_id = prof
  )
  order by c."New_code";
$function$;

create or replace function public.search_instructors_with_courses(keyword text)
returns table(prof_name text, course_list jsonb)
language sql
stable
security invoker
set search_path = public
as $_$
with normalized_professors as (
  select trim(p.name) as normalized_name
  from public.prof_info p
  where trim(p.name) ilike '%' || replace(replace(keyword, '%20', ' '), '$', '/') || '%'
  group by trim(p.name)
)
select
  np.normalized_name as prof_name,
  coalesce(
    jsonb_agg(distinct to_jsonb(c)) filter (where c."New_code" is not null),
    '[]'::jsonb
  ) as course_list
from normalized_professors np
left join public.prof_with_course pwc
  on trim(pwc.prof_id) = np.normalized_name
left join public.course_noporf c
  on c."New_code" = public.resolve_course_code(pwc.course_id)
group by np.normalized_name
order by np.normalized_name asc;
$_$;

create or replace function public.get_offer_list_by_prof(course_code text, prof text)
returns setof public.offer
language sql
stable
security invoker
set search_path = public
as $function$
  select o.*
  from public.offer o
  where o.course_id in (
    select p.id
    from public.prof_with_course p
    where p.course_id = any(public.course_group_codes(course_code))
      and p.prof_id = prof
  );
$function$;

create or replace function public.get_prof_course_id(input_course_code text, input_prof_id text)
returns table(id integer)
language sql
stable
security invoker
set search_path = public
as $function$
  select p.id
  from public.prof_with_course p
  where p.course_id = any(public.course_group_codes(input_course_code))
    and p.prof_id = input_prof_id;
$function$;

create or replace function public.get_popular_courses(
  target_days integer default 30,
  result_limit integer default 5
)
returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  comment_count bigint,
  avg_result real,
  latest_comment_at timestamp without time zone
)
language sql
stable
security invoker
set search_path = public
as $function$
  with recent_comments as (
    select
      comment.course_id,
      comment.result,
      comment.pub_time
    from public.comment
    where comment.replyto is null
      and comment.hidden <> 1
      and comment.pub_time >= (now() at time zone 'UTC')
        - make_interval(days => greatest(least(coalesce(target_days, 30), 365), 1))
  )
  select
    course."New_code"::text as course_code,
    course."courseTitleEng"::text as course_title_eng,
    course."courseTitleChi"::text as course_title_chi,
    course."Offering_Unit"::text as offering_unit,
    stats.comment_count,
    stats.avg_result,
    stats.latest_comment_at
  from (
    select
      public.resolve_course_code(prof_with_course.course_id) as course_id,
      count(*)::bigint as comment_count,
      avg(recent_comments.result)::real as avg_result,
      max(recent_comments.pub_time) as latest_comment_at
    from recent_comments
    join public.prof_with_course
      on prof_with_course.id = recent_comments.course_id
    group by public.resolve_course_code(prof_with_course.course_id)
  ) as stats
  join public.course_noporf as course
    on course."New_code" = stats.course_id
  where course."New_code" not ilike 'TEST%'
  order by
    stats.comment_count desc,
    stats.latest_comment_at desc,
    course."New_code" asc
  limit greatest(least(coalesce(result_limit, 5), 50), 1);
$function$;

-- ---------------------------------------------------------------------------
-- Update pipeline RPCs
-- ---------------------------------------------------------------------------

create or replace function public.admin_mark_offered(codes text[])
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  affected integer;
begin
  with input as (
    select distinct upper(btrim(value)) as code
    from unnest(codes) value
    where coalesce(btrim(value), '') <> ''
  ), targets as (
    select code from input
    union
    select public.resolve_course_code(code) from input
    union
    select e.equivalent_code
    from public.course_equivalences e
    where e.primary_code in (select public.resolve_course_code(code) from input)
  )
  update public.course_noporf c
  set "Is_Offered" = 1
  where c."New_code" in (select code from targets);
  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.admin_upsert_offered_courses(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  upserted integer := 0;
  marked integer := 0;
  linked integer := 0;
begin
  insert into public.course_noporf (
    "Offering_Unit", "Offering_Department", "New_code", "Old_code",
    "courseTitleEng", "courseTitleChi", "Credits", "Course_Duration",
    "Medium_of_Instruction", "Is_Offered", "offeringProgLevel", "courseType",
    "suggestedYearOfStudy", "gradingSystem", "courseDescription", ilo
  )
  select
    coalesce(x."Offering_Unit", ''),
    coalesce(x."Offering_Department", ''),
    upper(btrim(x."New_code")),
    coalesce(x."Old_code", ''),
    coalesce(x."courseTitleEng", ''),
    coalesce(x."courseTitleChi", ''),
    coalesce(x."Credits", ''),
    coalesce(x."Course_Duration", ''),
    coalesce(x."Medium_of_Instruction", ''),
    1,
    x."offeringProgLevel",
    x."courseType",
    x."suggestedYearOfStudy",
    x."gradingSystem",
    x."courseDescription",
    x.ilo
  from jsonb_to_recordset(coalesce(payload->'inserts', '[]'::jsonb)) as x(
    "Offering_Unit" text, "Offering_Department" text, "New_code" text, "Old_code" text,
    "courseTitleEng" text, "courseTitleChi" text, "Credits" text, "Course_Duration" text,
    "Medium_of_Instruction" text, "offeringProgLevel" text, "courseType" text,
    "suggestedYearOfStudy" numeric, "gradingSystem" text, "courseDescription" text, ilo text,
    equivalent_code text, equivalence_source text, equivalence_confidence numeric
  )
  where coalesce(x."New_code", '') <> ''
  on conflict ("New_code") do update set "Is_Offered" = 1;
  get diagnostics upserted = row_count;

  insert into public.course_equivalences (
    primary_code, equivalent_code, source, confidence
  )
  select distinct
    upper(btrim(x."New_code")),
    upper(btrim(x.equivalent_code)),
    coalesce(nullif(btrim(x.equivalence_source), ''), 'auto'),
    x.equivalence_confidence
  from jsonb_to_recordset(coalesce(payload->'inserts', '[]'::jsonb)) as x(
    "New_code" text, equivalent_code text, equivalence_source text, equivalence_confidence numeric
  )
  where coalesce(x."New_code", '') <> ''
    and coalesce(x.equivalent_code, '') <> ''
    and upper(btrim(x."New_code")) <> upper(btrim(x.equivalent_code))
    and exists (
      select 1 from public.course_noporf p
      where p."New_code" = upper(btrim(x."New_code"))
    )
    and exists (
      select 1 from public.course_noporf e
      where e."New_code" = upper(btrim(x.equivalent_code))
    )
    and not exists (
      select 1 from public.course_equivalences q
      where q.equivalent_code = upper(btrim(x."New_code"))
         or q.primary_code = upper(btrim(x.equivalent_code))
    )
  on conflict (primary_code, equivalent_code) do update
    set source = excluded.source,
        confidence = excluded.confidence,
        updated_at = now();
  get diagnostics linked = row_count;

  with codes as (
    select distinct upper(btrim(value)) as code
    from jsonb_array_elements_text(coalesce(payload->'offered_codes', '[]'::jsonb))
    where coalesce(btrim(value), '') <> ''
  ), targets as (
    select code from codes
    union
    select public.resolve_course_code(code) from codes
    union
    select e.equivalent_code
    from public.course_equivalences e
    where e.primary_code in (select public.resolve_course_code(code) from codes)
  )
  update public.course_noporf c
  set "Is_Offered" = 1
  where c."New_code" in (select code from targets);
  get diagnostics marked = row_count;

  return jsonb_build_object(
    'upserted', upserted,
    'linked', linked,
    'marked', marked
  );
end;
$function$;

create or replace function public.admin_apply_schedule(payload jsonb, scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_year integer := nullif(payload->>'year', '')::integer;
  target_sem integer := nullif(payload->>'sem', '')::integer;
  tl_rows integer := 0;
  pwc_rows integer := 0;
  offer_rows integer := 0;
  sched_rows integer := 0;
begin
  if scope not in ('time_location', 'prof_course', 'offer', 'all') then
    raise exception 'invalid scope: %', scope;
  end if;

  if scope in ('offer', 'all') and (target_year is null or target_sem is null) then
    raise exception 'year and sem are required for scope %', scope;
  end if;

  with rows as (
    select distinct
      upper(btrim(r->>'day')) as date,
      replace(btrim(r->>'times'), ' ', '') as times,
      btrim(r->>'location') as location
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.time_location (date, times, location)
    select date, times, location from rows
    on conflict (date, times, location) do nothing
    returning 1
  )
  select count(*) into tl_rows from ins;

  if scope = 'time_location' then
    return jsonb_build_object('time_location', tl_rows);
  end if;

  with rows as (
    select distinct
      public.resolve_course_code(btrim(r->>'code')) as course_id,
      btrim(r->>'prof') as prof_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'code', '') <> '' and coalesce(r->>'prof', '') <> ''
  ), ins as (
    insert into public.prof_with_course (course_id, prof_id, is_offered)
    select course_id, prof_id, 1 from rows
    on conflict (course_id, prof_id) do update set is_offered = 1
    returning 1
  )
  select count(*) into pwc_rows from ins;

  if scope = 'prof_course' then
    return jsonb_build_object('prof_with_course', pwc_rows);
  end if;

  with rows as (
    select distinct p.id as pwc_id, btrim(r->>'section') as section
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = public.resolve_course_code(btrim(r->>'code'))
     and p.prof_id = btrim(r->>'prof')
    where coalesce(r->>'section', '') <> ''
  ), ins as (
    insert into public.offer (course_id, section, year, sem)
    select pwc_id, section, target_year, target_sem from rows
    on conflict (course_id, section, year, sem) do nothing
    returning 1
  )
  select count(*) into offer_rows from ins;

  with rows as (
    select distinct o.id as offer_id, tl.id as tl_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = public.resolve_course_code(btrim(r->>'code'))
     and p.prof_id = btrim(r->>'prof')
    join public.offer o
      on o.course_id = p.id and o.section = btrim(r->>'section')
     and o.year = target_year and o.sem = target_sem
    join public.time_location tl
      on tl.date = upper(btrim(r->>'day'))
     and tl.times = replace(btrim(r->>'times'), ' ', '')
     and tl.location = btrim(r->>'location')
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.schedule (course_id, time_location_id)
    select offer_id, tl_id from rows
    on conflict (course_id, time_location_id) do nothing
    returning 1
  )
  select count(*) into sched_rows from ins;

  return jsonb_build_object(
    'time_location', tl_rows,
    'prof_with_course', pwc_rows,
    'offer', offer_rows,
    'schedule', sched_rows
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Equivalence matching / admin management
-- ---------------------------------------------------------------------------

-- Given the UM metadata for newly-seen primary codes, find at most one
-- unambiguous old course per code. Candidates must share an exact normalized
-- title or description, and must not belong to the current import batch.
create or replace function public.admin_match_course_equivalences(payload jsonb)
returns table (
  primary_code text,
  equivalent_code text,
  confidence numeric,
  source text
)
language sql
stable
security definer
set search_path = public
as $function$
  with input as (
    select
      upper(btrim(x.code)) as primary_code,
      btrim(coalesce(x.title, '')) as title,
      btrim(coalesce(x.credits, '')) as credits,
      btrim(coalesce(x.description, '')) as description
    from jsonb_to_recordset(coalesce(payload->'courses', '[]'::jsonb)) as x(
      code text, title text, credits text, description text
    )
    where coalesce(x.code, '') <> ''
  ), excluded as (
    select distinct upper(btrim(value)) as code
    from jsonb_array_elements_text(coalesce(payload->'exclude_codes', '[]'::jsonb))
  ), candidates as (
    select
      i.primary_code,
      c."New_code" as equivalent_code,
      (
        lower(regexp_replace(i.title, '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(c."courseTitleEng"), '\s+', ' ', 'g'))
      ) as title_match,
      (
        substring(i.primary_code from '[0-9]{4}')
        = substring(c."New_code" from '[0-9]{4}')
      ) as number_match,
      (
        i.description <> ''
        and lower(btrim(i.description)) = lower(btrim(coalesce(c."courseDescription", '')))
      ) as description_match,
      (i.credits <> '' and i.credits = btrim(c."Credits")) as credits_match,
      exists (
        select 1 from public.prof_with_course p where p.course_id = c."New_code"
      ) as has_prof,
      exists (
        select 1
        from public.prof_with_course p
        join public.comment cm on cm.course_id = p.id
        where p.course_id = c."New_code"
      ) as has_comments
    from input i
    join public.course_noporf c on true
    where c."New_code" <> i.primary_code
      and not exists (select 1 from excluded x where x.code = c."New_code")
      -- A candidate may already be an equivalent of another primary (TLL C/P
      -- share one LAWS code), but it must never be a primary itself.
      and not exists (
        select 1 from public.course_equivalences e
        where e.primary_code = c."New_code"
      )
      and not exists (
        select 1 from public.course_equivalences e
        where e.equivalent_code = i.primary_code or e.primary_code = i.primary_code
      )
      and (
        lower(regexp_replace(i.title, '\s+', ' ', 'g'))
          = lower(regexp_replace(btrim(c."courseTitleEng"), '\s+', ' ', 'g'))
        or (
          i.description <> ''
          and lower(btrim(i.description)) = lower(btrim(coalesce(c."courseDescription", '')))
        )
      )
  ), scored as (
    select
      *,
      (
        (case when title_match then 40 else 0 end)
        + (case when number_match then 30 else 0 end)
        + (case when description_match then 30 else 0 end)
        + (case when credits_match then 10 else 0 end)
        + (case when has_comments then 20 else 0 end)
        + (case when has_prof then 10 else 0 end)
      )::int as score,
      concat_ws(
        '+',
        case when title_match then 'title' end,
        case when number_match then 'number' end,
        case when description_match then 'description' end,
        case when credits_match then 'credits' end
      ) as match_reason
    from candidates
  ), with_top as (
    select *, max(score) over (partition by primary_code) as top_score
    from scored
  ), ranked as (
    select
      *,
      count(*) filter (where score = top_score) over (partition by primary_code) as top_count,
      row_number() over (
        partition by primary_code
        order by score desc, has_comments desc, has_prof desc, equivalent_code
      ) as rn
    from with_top
  )
  select
    r.primary_code,
    r.equivalent_code,
    least(round(r.score::numeric / 140, 3), 1) as confidence,
    'auto:' || r.match_reason as source
  from ranked r
  where r.rn = 1
    and r.top_count = 1
    and r.top_score >= 70;
$function$;

create or replace function public.admin_link_course_equivalence(
  p_primary text,
  p_equivalent text,
  p_source text default 'manual',
  p_confidence numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  primary_code_value text := upper(btrim(coalesce(p_primary, '')));
  equivalent_code_value text := upper(btrim(coalesce(p_equivalent, '')));
begin
  if primary_code_value = '' or equivalent_code_value = '' then
    raise exception 'primary and equivalent codes are required';
  end if;
  if primary_code_value = equivalent_code_value then
    raise exception 'a course cannot be equivalent to itself';
  end if;
  if not exists (
    select 1 from public.course_noporf where "New_code" = primary_code_value
  ) then
    raise exception 'primary course % not found', primary_code_value;
  end if;
  if not exists (
    select 1 from public.course_noporf where "New_code" = equivalent_code_value
  ) then
    raise exception 'equivalent course % not found', equivalent_code_value;
  end if;

  insert into public.course_equivalences (
    primary_code, equivalent_code, source, confidence
  )
  values (
    primary_code_value, equivalent_code_value, coalesce(nullif(btrim(p_source), ''), 'manual'), p_confidence
  )
  on conflict (primary_code, equivalent_code) do update
    set source = excluded.source,
        confidence = excluded.confidence,
        updated_at = now();

  return jsonb_build_object(
    'primary_code', primary_code_value,
    'equivalent_code', equivalent_code_value
  );
end;
$function$;

create or replace function public.admin_unlink_course_equivalence(
  p_primary text,
  p_equivalent text
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  affected integer;
begin
  delete from public.course_equivalences
  where primary_code = upper(btrim(coalesce(p_primary, '')))
    and equivalent_code = upper(btrim(coalesce(p_equivalent, '')));
  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.admin_set_course_equivalences(
  p_primary text,
  p_equivalents text[],
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  primary_code_value text := upper(btrim(coalesce(p_primary, '')));
  wanted text[];
  removed integer;
  linked integer := 0;
  code text;
begin
  if primary_code_value = '' then
    raise exception 'primary code is required';
  end if;

  select coalesce(array_agg(distinct upper(btrim(value))), '{}'::text[])
  into wanted
  from unnest(coalesce(p_equivalents, '{}'::text[])) value
  where coalesce(btrim(value), '') <> ''
    and upper(btrim(value)) <> primary_code_value;

  delete from public.course_equivalences e
  where e.primary_code = primary_code_value
    and not (e.equivalent_code = any(wanted));
  get diagnostics removed = row_count;

  foreach code in array wanted loop
    perform public.admin_link_course_equivalence(primary_code_value, code, p_source, null);
    linked := linked + 1;
  end loop;

  return jsonb_build_object(
    'primary_code', primary_code_value,
    'equivalents', wanted,
    'removed', removed,
    'linked', linked
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- One-time backfill for the 2026-10-24 pre-enrollment sync
-- ---------------------------------------------------------------------------

insert into public.course_equivalences (
  primary_code, equivalent_code, source, confidence
)
select
  v.primary_code,
  v.equivalent_code,
  'backfill:2026-10-24',
  1.000
from (values
    ('CSCI1000', 'CISC1000'),
    ('CSCI1001', 'CISC1001'),
    ('CSCI1002', 'CISC1002'),
    ('CSCI2005', 'CISC2005'),
    ('CSCI2006', 'CISC2006'),
    ('CSCI2008', 'CISC2008'),
    ('CSCI3000', 'CISC3000'),
    ('CSCI3001', 'CISC3001'),
    ('CSCI3002', 'CISC3002'),
    ('CSCI3003', 'CISC3003'),
    ('CSCI3005', 'CISC3005'),
    ('CSCI3009', 'CISC3009'),
    ('CSCI3018', 'CISC3018'),
    ('CSCI3020', 'CISC3020'),
    ('CSCI3023', 'CISC3023'),
    ('CSCI3025', 'CISC3025'),
    ('CSCI4001', 'CISC4001'),
    ('CSCI4002', 'CISC4002'),
    ('BMSC1003', 'HSCI1003'),
    ('BMSC1004', 'HSCI1004'),
    ('BMSC1009', 'HSCI1009'),
    ('BMSC2004', 'HSCI2004'),
    ('BMSC2005', 'HSCI2005'),
    ('BMSC2006', 'HSCI2006'),
    ('BMSC2007', 'HSCI2007'),
    ('BMSC3004', 'HSCI3004'),
    ('BMSC3005', 'HSCI3005'),
    ('BMSC4006', 'HSCI4006'),
    ('BMSC4007', 'HSCI4007'),
    ('PHPS1005', 'HSCI1005'),
    ('PHPS1006', 'HSCI1006'),
    ('PHPS2008', 'HSCI2008'),
    ('PHPS2009', 'HSCI2009'),
    ('PHPS2010', 'HSCI2010'),
    ('PHPS2013', 'HSCI2013'),
    ('PHPS3008', 'HSCI3008'),
    ('PHPS3009', 'HSCI3009'),
    ('PHPS3014', 'HSCI3014'),
    ('PHPS4009', 'HSCI4009'),
    ('PHPS4010', 'HSCI4010'),
    ('PHPS4011', 'HSCI4011'),
    ('CHEM1003', 'APAC1003'),
    ('CHEM2003', 'APAC2003'),
    ('CHEM3005', 'APAC3005'),
    ('CHEM3009', 'APAC3009'),
    ('CHEM4001', 'APAC4001'),
    ('PHYS1002', 'APAC1002'),
    ('PHYS2000', 'APAC2000'),
    ('PHYS2004', 'APAC2004'),
    ('PHYS2005', 'APAC2005'),
    ('PHYS3004', 'APAC3004'),
    ('PHYS3006', 'APAC3006'),
    ('PHYS4004', 'APAC4004'),
    ('PHYS4009', 'APAC4009'),
    ('MSEN3003', 'APAC3003'),
    ('TLL1002C', 'LAWS1002'),
    ('TLL1002P', 'LAWS1002'),
    ('TLL1005C', 'LAWS1005'),
    ('TLL1005P', 'LAWS1005'),
    ('TLL1006C', 'LAWS1006'),
    ('TLL1006P', 'LAWS1006'),
    ('TLL1007C', 'LAWS1007'),
    ('TLL1007P', 'LAWS1007'),
    ('TLL1008C', 'LAWS1008'),
    ('TLL1008P', 'LAWS1008'),
    ('TLL1017C', 'LAWS1017'),
    ('TLL1017P', 'LAWS1017'),
    ('TLL1021C', 'LAWS1021'),
    ('TLL1021P', 'LAWS1021'),
    ('TLL2002C', 'LAWS2002'),
    ('TLL2002P', 'LAWS2002'),
    ('TLL2003C', 'LAWS2003'),
    ('TLL2003P', 'LAWS2003'),
    ('TLL2006C', 'LAWS2006'),
    ('TLL2006P', 'LAWS2006'),
    ('TLL2007C', 'LAWS2007'),
    ('TLL2007P', 'LAWS2007'),
    ('TLL3000C', 'LAWS3000'),
    ('TLL3001C', 'LAWS3001'),
    ('TLL3002C', 'LAWS3002'),
    ('TLL3002P', 'LAWS3002'),
    ('TLL3003C', 'LAWS3003'),
    ('TLL3003P', 'LAWS3003'),
    ('TLL3004C', 'LAWS3004'),
    ('TLL3005C', 'LAWS3005'),
    ('TLL3006C', 'LAWS3006'),
    ('TLL3006P', 'LAWS3006'),
    ('TLL3007C', 'LAWS3007'),
    ('TLL3008C', 'LAWS3008'),
    ('TLL3009C', 'LAWS3009'),
    ('TLL3012C', 'LAWS3012'),
    ('TLL3012P', 'LAWS3012'),
    ('TLL3013C', 'LAWS3013'),
    ('TLL3013P', 'LAWS3013'),
    ('TLL3014C', 'LAWS3014'),
    ('TLL3015C', 'LAWS3015'),
    ('TLL3016C', 'LAWS3016'),
    ('TLL3017C', 'LAWS3017'),
    ('TLL3018C', 'LAWS3018'),
    ('TLL3019C', 'LAWS3019'),
    ('TLL3046C', 'LAWS3046'),
    ('TLL3047P', 'LAWS3047'),
    ('TLL3049P', 'LAWS3049'),
    ('TLL4002C', 'LAWS4002'),
    ('TLL4002P', 'LAWS4002'),
    ('TLL4003C', 'LAWS4003'),
    ('TLL4003P', 'LAWS4003'),
    ('TLL4004C', 'LAWS4004'),
    ('TLL4005C', 'LAWS4005'),
    ('TLL4006C', 'LAWS4006'),
    ('TLL4007C', 'LAWS4007'),
    ('TLL4008C', 'LAWS4008'),
    ('TLL4008P', 'LAWS4008'),
    ('TLL4009C', 'LAWS4009'),
    ('TLL4009P', 'LAWS4009'),
    ('TLL4011C', 'LAWS4011'),
    ('TLL4011P', 'LAWS4011'),
    ('TLL4012C', 'LAWS4012'),
    ('TLL4012P', 'LAWS4012'),
    ('TLL4013C', 'LAWS4013'),
    ('TLL4014C', 'LAWS4014'),
    ('BIOS3016', 'HSCI3016'),
    ('MEDI4005', 'HSCI4005')
) as v(primary_code, equivalent_code)
where exists (
  select 1 from public.course_noporf p where p."New_code" = v.primary_code
)
and exists (
  select 1 from public.course_noporf e where e."New_code" = v.equivalent_code
)
and not exists (
  select 1 from public.course_equivalences q
  where q.equivalent_code = v.primary_code or q.primary_code = v.equivalent_code
)
on conflict (primary_code, equivalent_code) do nothing;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

alter table public.course_equivalences enable row level security;
drop policy if exists course_equivalences_read on public.course_equivalences;
create policy course_equivalences_read
  on public.course_equivalences for select to anon, authenticated using (true);

grant select on public.course_equivalences to anon, authenticated, service_role;
grant select on public.course_catalog to anon, authenticated, service_role;

grant execute on function public.resolve_course_code(text) to anon, authenticated, service_role;
grant execute on function public.course_group_codes(text) to anon, authenticated, service_role;

grant execute on function public.admin_match_course_equivalences(jsonb) to service_role;
grant execute on function public.admin_link_course_equivalence(text, text, text, numeric) to service_role;
grant execute on function public.admin_unlink_course_equivalence(text, text) to service_role;
grant execute on function public.admin_set_course_equivalences(text, text[], text) to service_role;

notify pgrst, 'reload schema';
