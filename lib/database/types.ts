export type CourseRow = {
  New_code: string;
  Offering_Unit: string;
  Offering_Department: string;
  Old_code: string;
  courseTitleEng: string;
  courseTitleChi: string;
  Credits: string;
  Course_Duration: string;
  Medium_of_Instruction: string;
  Is_Offered: number;
  offeringProgLevel: string | null;
  courseType: string | null;
  suggestedYearOfStudy: number | null;
  gradingSystem: string | null;
  courseDescription: string | null;
  ilo: string | null;
  [key: string]: unknown;
};

export type ProfWithCourseRow = {
  id: number;
  course_id: string;
  prof_id: string;
  result: number;
  grade: number;
  hard: number;
  reward: number;
  attendance: number;
  comments: number;
  is_offered: number | boolean | null;
  admin_note: string | null;
  admin_note_en: string | null;
  [key: string]: unknown;
};

export type CommentPageRow = {
  id: number;
  content: string | null;
  pub_time: string;
  result: number;
  upvote: number;
  downvote: number;
  course_id: number;
  verify: number;
  avatar_seed: string | null;
  content_en: string | null;
  img: string | null;
  replyto: number | null;
  hidden: number;
  upvote_count: number;
  downvote_count: number;
  emoji_counts: Array<{ emoji: string; count: number }>;
  vote_history: Array<{
    comment_id: number;
    offset: number;
    created_at: string;
    emoji: string | null;
  }>;
  [key: string]: unknown;
};

export type FacultyStatisticRow = {
  id: number;
  name: string;
  course_num: number;
  comment_num: number;
};

export type PopularCourseRow = {
  courseCode: string;
  courseTitleEng: string;
  courseTitleChi: string | null;
  offeringUnit: string;
  commentCount: number;
  avgResult: number;
  latestCommentAt: string;
};
