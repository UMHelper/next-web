export type PoolCourse = {
  courseCode: string;
  titleEn: string;
  titleZh: string;
  credits: string | null;
  courseType: string | null;
  suggestedYear: number | null;
  faculty: string;
  department: string;
  aka: string[];
  topicTitle: string;
  topicBody: string;
};

export type PoolInstructorRow = {
  pwcId: number;
  courseCode: string;
  instructor: string;
  reviews: number;
  result: number;
  grade: number;
  difficulty: number;
  reward: number | null;
};

export type PoolOffer = {
  pwcId: number;
  section: string;
  meetings: { date: unknown; times: unknown; location: unknown }[];
};

export type DiscoveryPool = {
  term: { year: number; sem: number };
  totalMatchingCourses: number;
  truncated: boolean;
  excludedCodesMatched: number;
  offersTruncated: boolean;
  courses: PoolCourse[];
  instructorRows: PoolInstructorRow[];
  offers: PoolOffer[];
};

export type ReviewTextRow = {
  pwcId: number;
  texts: string[];
};
