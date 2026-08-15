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


