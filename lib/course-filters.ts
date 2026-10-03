/**
 * CourseFilter 的筛选语义，从组件里抽出来的纯函数。
 *
 * 抽出来的理由不只是"可测试"：埋点 `filter_apply` 需要**在事件处理函数里同步**
 * 知道"应用这次筛选之后还剩多少条"，而在 state 更新的 useEffect 里事后补报会与
 * 事件错一拍。纯函数让两处用同一份逻辑。
 */

export const COURSE_FILTER_KEYS = [
  "Medium_of_Instruction",
  "Offering_Department",
  "Course_Duration",
  "Credits",
  "Is_Offered",
  "Offering_Unit",
  "courseType",
  "offeringProgLevel",
  "suggestedYearOfStudy",
] as const;

export type CourseFilterKey = (typeof COURSE_FILTER_KEYS)[number];

/**
 * 筛选状态。`undefined` 显式写进值类型：`applyCourseFilters` 用它判断"该维度未
 * 设置"，也让 `value === undefined` 这类比较在 strict 下不触发 TS2367。
 *
 * 注意：状态有 9 个维度，但 UI 只渲染 6 个（`courseKeysToCount`：Credits /
 * Is_Offered / Offering_Department / Offering_Unit / courseType /
 * offeringProgLevel）。剩下 3 个（Course_Duration、Medium_of_Instruction、
 * suggestedYearOfStudy）当前不可选，但仍是状态的一部分，保持与既有代码一致。
 */
export type CourseFilterState = Record<string, string | number | undefined>;

export const ALL_FILTERS = "All";

export function createInitialFilterState(): CourseFilterState {
  return Object.fromEntries(COURSE_FILTER_KEYS.map((key) => [key, ALL_FILTERS]));
}

/** 把一次下拉选择转成新的筛选状态。`Is_Offered` 的三态映射沿用既有语义。 */
export function nextFilterState(
  current: CourseFilterState,
  key: string,
  value: string,
): CourseFilterState {
  const next: CourseFilterState = { ...current };

  if (key === "Is_Offered") {
    if (value === "Offered") next.Is_Offered = 1;
    else if (value === "Not Offered") next.Is_Offered = 0;
    else next.Is_Offered = ALL_FILTERS;
    return next;
  }

  next[key] = value;
  return next;
}

/** 纯函数：`All` 表示该维度不参与过滤；多个维度之间是 AND。 */
export function applyCourseFilters<T extends Record<string, unknown>>(
  data: T[],
  filter: CourseFilterState,
): T[] {
  let result = [...data];

  for (const key of COURSE_FILTER_KEYS) {
    const value = filter[key];
    if (value === undefined || value === ALL_FILTERS) continue;
    result = result.filter((course) => course[key] === value);
  }

  return result;
}
