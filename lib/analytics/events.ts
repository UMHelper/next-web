import { emit } from "./data-layer";

export type SearchScope = "course" | "instructor";

/** 与 SearchForm 的 `variant` 取值一一对应。 */
export type SearchEntryPoint = "hero" | "header" | "dialog" | "inline";

export type ItemListName =
  | "catalog"
  | "search_course"
  | "search_instructor"
  | "course_instructors"
  | "professor_courses";

export function trackSearch(input: {
  term: string;
  scope: SearchScope;
  entryPoint: SearchEntryPoint;
}): void {
  emit("search", {
    // 统一大写：`view_search_results` 的 search_term 来自 URL（buildSearchPath 已规范成大写），
    // 这里如果原样上报用户输入（comp1001），GA4 会把大小写当成两个取值，提交→结果就对不上了。
    search_term: input.term.toUpperCase(),
    search_scope: input.scope,
    entry_point: input.entryPoint,
  });
}

export function trackSearchResults(input: {
  term: string;
  scope: SearchScope;
  resultCount: number;
}): void {
  emit("view_search_results", {
    search_term: input.term,
    search_scope: input.scope,
    result_count: input.resultCount,
    has_results: input.resultCount > 0,
  });
}

export function trackFilterApply(input: {
  name: string;
  value: string;
  resultCount: number;
}): void {
  emit("filter_apply", {
    filter_name: input.name,
    filter_value: input.value,
    result_count: input.resultCount,
  });
}

export function trackSelectItem(input: {
  itemId: string;
  listName: ItemListName;
  position: number;
  faculty?: string;
}): void {
  const params: Record<string, string | number> = {
    item_id: input.itemId,
    item_list_name: input.listName,
    position: input.position,
  };

  if (input.faculty) params.faculty = input.faculty;

  emit("select_item", params);
}
