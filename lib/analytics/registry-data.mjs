/**
 * 事件字典的物理数据源。
 *
 * 这个文件必须是**纯数据 + 纯 ESM**：Node 生成脚本
 * （scripts/print-analytics-manifest.mjs）与运行时代码读的是同一份数据，
 * 因此 GTM 清单不可能与代码漂移。不要在这里 import 任何东西。
 */

export const ANALYTICS_EVENTS = {
  search: {
    ga4: "recommended",
    purpose: "用户主动提交搜索：记录搜了什么、按课程还是讲师、从哪个入口进来",
    wiring: "components/search/search-form.tsx",
    params: {
      search_term: {
        type: "string",
        required: true,
        note: "用户输入的关键词（表单已用 zod 校验 4-30 字符）",
      },
      search_scope: { type: "string", required: true, note: "course 或 instructor" },
      entry_point: {
        type: "string",
        required: true,
        note: "SearchForm 的 variant：hero（首页）/ header（搜索页顶栏）/ dialog（顶栏弹窗）/ inline",
      },
    },
  },

  view_search_results: {
    ga4: "recommended",
    purpose: "搜索结果页展示：结果数，尤其是 0 结果（教务库缺口信号）",
    wiring: "components/course-filter.tsx, app/search/instructor/[...name]/page.tsx",
    params: {
      search_term: { type: "string", required: true, note: "本次搜索的关键词" },
      search_scope: { type: "string", required: true, note: "course 或 instructor" },
      result_count: {
        type: "number",
        required: true,
        note: "服务端返回的原始结果条数（课程=课程数，讲师=讲师数），不受用户后续筛选影响",
      },
      has_results: { type: "number", required: true, note: "1 = 有结果，0 = 无结果（布尔在代码里归一为 1/0）" },
    },
  },

  filter_apply: {
    ga4: "custom",
    purpose: "课程列表的筛选使用情况：用户真正在意哪个维度、筛完还剩多少条",
    wiring: "components/course-filter.tsx",
    params: {
      filter_name: {
        type: "string",
        required: true,
        note: "筛选维度内部键名，如 Offering_Department / Is_Offered / Credits",
      },
      filter_value: { type: "string", required: true, note: "用户选择的值；All 表示清除该维度" },
      result_count: { type: "number", required: true, note: "应用这次筛选之后的列表条数" },
    },
  },

  select_item: {
    ga4: "recommended",
    purpose: "从列表进入详情的点击：来源列表、点击位置（列表 CTR）",
    wiring: "components/course-card.tsx, components/prof-card.tsx",
    params: {
      item_id: { type: "string", required: true, note: "课程号（如 COMP1001）或讲师 id（prof_id）" },
      item_list_name: {
        type: "string",
        required: true,
        note: "catalog / search_course / search_instructor / course_instructors / professor_courses",
      },
      position: { type: "number", required: true, note: "该条目在列表数组里的下标（广告位不占号）" },
      faculty: {
        type: "string",
        required: false,
        note: "Offering_Unit；数据里没有该字段时省略此参数，不硬凑",
      },
    },
  },
};

/** 任何事件都不得注册这些参数名（PII / 登录态 / 自由文本 / URL）。 */
export const FORBIDDEN_PARAM_NAMES = [
  "email",
  "user_id",
  "userid",
  "full_name",
  "name",
  "clerk_user_id",
  "content",
  "details",
  "comment",
  "reply_text",
  "url",
  "token",
  "share_url",
  "ip",
];
