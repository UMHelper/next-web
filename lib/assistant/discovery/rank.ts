import type { RuleOutcome } from "@/lib/assistant/discovery/constraints";
import type { DiscoveryFit, DiscoveryPriority } from "@/lib/assistant/discovery/schema";
import type { PoolCourse, PoolInstructorRow } from "@/lib/assistant/discovery/pool";
import type { SectionCandidate } from "@/lib/assistant/discovery/sections";
import { SMALL_REVIEW_SAMPLE } from "@/lib/assistant/rating-semantics";

const PRIORITY_WEIGHTS = [0.4, 0.25, 0.15, 0.1] as const;
const SCHEDULE_WEIGHT = 0.35;
const TOPIC_WEIGHT = 0.2;
const NEUTRAL_PRIOR = 3;

type RatingMetric = "difficulty" | "grade" | "result" | "reward";
type SignalKey = "ease" | "grade" | "rating" | "usefulness";

const PRIORITY_METRIC: Record<
  Exclude<DiscoveryPriority, "topic_match">,
  { metric: RatingMetric; signal: SignalKey }
> = {
  easier: { metric: "difficulty", signal: "ease" },
  higher_grades: { metric: "grade", signal: "grade" },
  better_rated: { metric: "result", signal: "rating" },
  more_useful: { metric: "reward", signal: "usefulness" },
};

export const RANKING_NOTE =
  "Sections are ranked by weighted rating signals (confidence-shrunk toward neutral), schedule and topic fit, then clash penalties; ties break on review count, course code, and section.";

export type RankingWeight = {
  key: DiscoveryPriority | "schedule";
  weight: number;
};

export type RankedRow = {
  score: number;
  reviews: number;
  courseCode: string;
  section: string;
};

function metricValue(row: PoolInstructorRow, metric: RatingMetric): number | null {
  const value = row[metric];
  if (value === null || value === undefined) return null;
  return value;
}

export function shrunkSignal(
  rows: PoolInstructorRow[],
  metric: RatingMetric,
): { mean: number | null; adjusted: number; reviews: number } {
  let weightedSum = 0;
  let reviews = 0;

  for (const row of rows) {
    const value = metricValue(row, metric);
    if (row.reviews > 0 && value !== null && value > 0) {
      weightedSum += value * row.reviews;
      reviews += row.reviews;
    }
  }

  if (reviews === 0) {
    return { mean: null, adjusted: NEUTRAL_PRIOR, reviews: 0 };
  }

  const mean = weightedSum / reviews;
  const adjusted =
    (reviews * mean + SMALL_REVIEW_SAMPLE * NEUTRAL_PRIOR) / (reviews + SMALL_REVIEW_SAMPLE);
  return { mean, adjusted, reviews };
}

function normalizedSignal(adjusted: number): number {
  return (adjusted - 1) / 4;
}

export function rankingWeights(input: {
  priorities: DiscoveryPriority[];
  hasPreferred: boolean;
  hasTopics: boolean;
}): RankingWeight[] {
  const effectivePriorities =
    input.priorities.length > 0 ? input.priorities : (["better_rated"] as DiscoveryPriority[]);

  if (input.priorities.length === 0 && !input.hasPreferred && !input.hasTopics) {
    return [{ key: "better_rated", weight: 1 }];
  }

  const raw: RankingWeight[] = [];
  effectivePriorities.forEach((priority, index) => {
    raw.push({ key: priority, weight: PRIORITY_WEIGHTS[index] ?? PRIORITY_WEIGHTS.at(-1)! });
  });

  if (input.hasPreferred) {
    raw.push({ key: "schedule", weight: SCHEDULE_WEIGHT });
  }

  const implicitTopic =
    input.hasTopics && !effectivePriorities.includes("topic_match");
  if (implicitTopic) {
    raw.push({ key: "topic_match", weight: TOPIC_WEIGHT });
  }

  const total = raw.reduce((sum, entry) => sum + entry.weight, 0);
  return raw.map((entry) => ({ key: entry.key, weight: entry.weight / total }));
}

function schedulePreferenceScore(preferred: RuleOutcome[]): number {
  if (preferred.length === 0) return 1;
  const violated = preferred.filter((outcome) => outcome.status === "violated").length;
  return 1 - violated / preferred.length;
}

function collectRatingTradeoffs(reviews: number, tradeoffs: string[]) {
  if (reviews === 0) {
    tradeoffs.push("no reviews");
    return;
  }
  if (reviews > 0 && reviews <= SMALL_REVIEW_SAMPLE) {
    tradeoffs.push(`only ${reviews} reviews`);
  }
}

function collectScheduleOutcomes(preferred: RuleOutcome[], matched: string[], tradeoffs: string[]) {
  for (const outcome of preferred) {
    if (outcome.status === "met") {
      matched.push(outcome.label);
    } else if (outcome.status === "violated") {
      tradeoffs.push(outcome.label);
    }
  }
}

export function topicScore(course: PoolCourse, topics: string[]): number {
  if (topics.length === 0) return 0;

  const title = `${course.titleEn} ${course.titleZh} ${course.topicTitle}`.toLowerCase();
  const body = `${course.topicBody}`.toLowerCase();

  let sum = 0;
  for (const topic of topics) {
    const needle = topic.trim().toLowerCase();
    if (!needle) continue;
    if (title.includes(needle)) {
      sum += 1;
    } else if (body.includes(needle)) {
      sum += 0.5;
    }
  }

  return Math.min(1, sum / topics.length);
}

export function scoreSection(input: {
  section: SectionCandidate;
  preferred: RuleOutcome[];
  topicScore: number;
  fit: DiscoveryFit;
  clashWith: string[];
  weights: ReturnType<typeof rankingWeights>;
}): {
  score: number;
  signals: Partial<
    Record<"ease" | "grade" | "rating" | "usefulness", { mean: number | null; adjusted: number; reviews: number }>
  >;
  tradeoffs: string[];
  matched: string[];
} {
  const signals: Partial<
    Record<"ease" | "grade" | "rating" | "usefulness", { mean: number | null; adjusted: number; reviews: number }>
  > = {};
  const matched: string[] = [];
  const tradeoffs: string[] = [];

  let weightedSum = 0;

  for (const { key, weight } of input.weights) {
    if (key === "schedule") {
      weightedSum += weight * schedulePreferenceScore(input.preferred);
      continue;
    }

    if (key === "topic_match") {
      weightedSum += weight * input.topicScore;
      continue;
    }

    const mapping = PRIORITY_METRIC[key];
    const signal = shrunkSignal(input.section.instructors, mapping.metric);
    signals[mapping.signal] = signal;
    const component = signal.reviews === 0 ? 0.5 : normalizedSignal(signal.adjusted);
    weightedSum += weight * component;
    collectRatingTradeoffs(signal.reviews, tradeoffs);
  }

  collectScheduleOutcomes(input.preferred, matched, tradeoffs);

  let score = Math.round(100 * weightedSum);

  if (input.fit === "confirmed_clash") {
    score = Math.round(score * 0.5);
    for (const label of input.clashWith) {
      tradeoffs.push(`clashes with ${label}`);
    }
  } else if (input.fit === "incomplete") {
    score = Math.round(score * 0.9);
    tradeoffs.push("clash check incomplete");
  }

  return { score, signals, tradeoffs, matched };
}

export function compareRanked(a: RankedRow, b: RankedRow): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.reviews !== a.reviews) return b.reviews - a.reviews;
  if (a.courseCode !== b.courseCode) return a.courseCode.localeCompare(b.courseCode);
  return a.section.localeCompare(b.section);
}
