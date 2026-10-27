import type { PoolCourse } from "@/lib/assistant/discovery/pool";

export const MAX_TOPIC_TERMS = 12;
export const MIN_TOPIC_COURSES = 3;

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "any",
  "are",
  "for",
  "from",
  "into",
  "that",
  "the",
  "this",
  "with",
  "your",
]);

const TIER_WEIGHTS = {
  1: { title: 1, body: 0.5 },
  2: { title: 0.75, body: 0.4 },
  3: { title: 0.5, body: 0.25 },
} as const;

export type TopicMatchTier = 1 | 2 | 3;
export type TopicMatchField = "title" | "body";

export type TopicPerMatch = {
  topic: string;
  tier: TopicMatchTier | null;
  field: TopicMatchField | null;
};

export type TopicMatchResult = {
  tier: TopicMatchTier | null;
  score: number;
  perTopic: TopicPerMatch[];
};

export type TopicFilterResult = {
  courses: PoolCourse[];
  topicFallback: boolean;
  topicTier: TopicMatchTier | null;
};

export function normalizeTopic(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function spellingVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized]);
  if (normalized.includes("macau")) {
    variants.add(normalized.replace(/\bmacau\b/g, "macao"));
  }
  if (normalized.includes("macao")) {
    variants.add(normalized.replace(/\bmacao\b/g, "macau"));
  }
  const compact = normalized.replace(/\s+/g, "");
  if (compact && compact !== normalized) variants.add(compact);
  return [...variants];
}

export function topicVariants(topic: string): string[] {
  const normalized = normalizeTopic(topic);
  if (!normalized) return [];
  const variants = spellingVariants(normalized);
  return variants.slice(0, 3);
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

export function significantWords(topic: string): string[] {
  const normalized = normalizeTopic(topic);
  if (!normalized) return [];

  if (containsCjk(normalized)) {
    const runs = normalized.match(/[\u3400-\u9fff]+/gu) ?? [];
    const words = runs.filter((run) => run.length >= 2);
    if (words.length > 0) return words.slice(0, 6);
  }

  const tokens = normalized.split(/[^a-z0-9]+/i).filter(Boolean);
  const words = tokens.filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  return words.slice(0, 6);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenMatches(haystack: string, token: string): boolean {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length <= 2) {
    return new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:[^a-z0-9]|$)`,
      "i",
    ).test(haystack);
  }
  if (containsCjk(normalized)) {
    return haystack.includes(normalized);
  }
  return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i").test(haystack);
}

function contiguousPhraseMatches(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeTopic(phrase);
  if (!normalizedPhrase) return false;
  const normalizedHaystack = normalizeTopic(haystack);
  if (normalizedPhrase.length <= 2) {
    return tokenMatches(normalizedHaystack, normalizedPhrase);
  }
  if (containsCjk(normalizedPhrase)) {
    return normalizedHaystack.includes(normalizedPhrase);
  }
  return normalizedHaystack.includes(normalizedPhrase);
}

function tier1Match(haystack: string, topic: string): boolean {
  return topicVariants(topic).some((variant) => contiguousPhraseMatches(haystack, variant));
}

function tier2Match(haystack: string, topic: string): boolean {
  const words = significantWords(topic);
  if (words.length === 0) return false;
  return words.every((word) => tokenMatches(haystack, word));
}

function tier3Match(haystack: string, topic: string): boolean {
  const words = significantWords(topic);
  if (words.length === 0) {
    const fallback = normalizeTopic(topic);
    return fallback.length >= 3 && tokenMatches(haystack, fallback);
  }
  return words.some((word) => tokenMatches(haystack, word));
}

function courseHaystacks(course: PoolCourse): { title: string; body: string; combined: string } {
  const title = `${course.titleEn} ${course.titleZh} ${course.topicTitle}`;
  const body = course.topicBody;
  return { title, body, combined: `${title} ${body}` };
}

function bestTopicMatch(
  course: PoolCourse,
  topic: string,
): { tier: TopicMatchTier | null; field: TopicMatchField | null; contribution: number } {
  const { title, body, combined } = courseHaystacks(course);

  if (tier1Match(title, topic)) {
    return { tier: 1, field: "title", contribution: TIER_WEIGHTS[1].title };
  }
  if (tier1Match(body, topic)) {
    return { tier: 1, field: "body", contribution: TIER_WEIGHTS[1].body };
  }
  if (tier2Match(title, topic)) {
    return { tier: 2, field: "title", contribution: TIER_WEIGHTS[2].title };
  }
  if (tier2Match(combined, topic)) {
    return { tier: 2, field: "body", contribution: TIER_WEIGHTS[2].body };
  }
  if (tier3Match(title, topic)) {
    return { tier: 3, field: "title", contribution: TIER_WEIGHTS[3].title };
  }
  if (tier3Match(combined, topic)) {
    return { tier: 3, field: "body", contribution: TIER_WEIGHTS[3].body };
  }

  return { tier: null, field: null, contribution: 0 };
}

export function matchTopic(course: PoolCourse, topics: string[]): TopicMatchResult {
  if (topics.length === 0) {
    return { tier: null, score: 0, perTopic: [] };
  }

  const perTopic: TopicPerMatch[] = [];
  let sum = 0;
  let bestTier: TopicMatchTier | null = null;

  for (const topic of topics) {
    const match = bestTopicMatch(course, topic);
    perTopic.push({ topic, tier: match.tier, field: match.field });
    sum += match.contribution;
    if (match.tier !== null && (bestTier === null || match.tier < bestTier)) {
      bestTier = match.tier;
    }
  }

  return {
    tier: bestTier,
    score: Math.min(1, sum / topics.length),
    perTopic,
  };
}

export function topicMatchLabels(result: TopicMatchResult): string[] {
  const labels: string[] = [];
  for (const entry of result.perTopic) {
    if (entry.tier === null) continue;
    if (entry.tier === 1) labels.push(`topic: ${entry.topic}`);
    else if (entry.tier === 2) labels.push(`topic words: ${entry.topic}`);
    else labels.push(`topic keyword (broadened): ${entry.topic}`);
  }
  return labels;
}

export function buildTopicSearchTerms(topics: string[]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const normalized = normalizeTopic(raw);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    terms.push(normalized);
  };

  for (const topic of topics) {
    for (const variant of topicVariants(topic)) push(variant);
    for (const word of significantWords(topic)) push(word);
    push(topic);
  }

  return terms.slice(0, MAX_TOPIC_TERMS);
}

export function filterCoursesByTopicMatch(
  courses: PoolCourse[],
  topics: string[],
): TopicFilterResult {
  if (topics.length === 0) {
    return { courses, topicFallback: false, topicTier: null };
  }

  const scored = courses.map((course) => ({ course, match: matchTopic(course, topics) }));
  let kept = scored.filter((entry) => entry.match.tier !== null && entry.match.tier <= 2);

  let topicFallback = false;
  if (kept.length < MIN_TOPIC_COURSES) {
    const tier3 = scored.filter((entry) => entry.match.tier === 3);
    topicFallback = tier3.length > 0;
    const existing = new Set(kept.map((entry) => entry.course.courseCode));
    for (const entry of tier3) {
      if (existing.has(entry.course.courseCode)) continue;
      kept.push(entry);
      existing.add(entry.course.courseCode);
      if (kept.length >= MIN_TOPIC_COURSES) break;
    }
    if (kept.length < MIN_TOPIC_COURSES) {
      for (const entry of tier3) {
        if (existing.has(entry.course.courseCode)) continue;
        kept.push(entry);
        existing.add(entry.course.courseCode);
      }
    }
  }

  const topicTier =
    kept.length === 0
      ? null
      : topicFallback
        ? 3
        : kept.reduce<TopicMatchTier>((max, entry) => {
            const tier = entry.match.tier;
            if (tier === null) return max;
            return tier > max ? tier : max;
          }, 1);

  return {
    courses: kept.map((entry) => entry.course),
    topicFallback,
    topicTier,
  };
}
