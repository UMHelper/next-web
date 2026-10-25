# 课程课号等价（course equivalences）

最后更新：2026-10-24

## 背景

UM 会修改课程编号，例如 `CISC1001` 改成 `CSCI1001`。旧编号下的
`course_noporf` 行保存着历史评论、教师聚合数据；新编号是当前培养方案里
要展示的主课程。如果直接把新编号当成一门新课程，评论页和教师列表会是空的。

`course_equivalences` 表把两者标记为等价：

```sql
create table public.course_equivalences (
  primary_code    text not null references course_noporf("New_code"),
  equivalent_code text not null references course_noporf("New_code"),
  ...
  unique (primary_code, equivalent_code)
);
```

- `primary_code`：新编号，前端主展示、URL/SEO 的规范编号。
- `equivalent_code`：旧编号，历史数据所在。
- 一个旧编号可以被多个新编号共享（例如 `TLL1002C` / `TLL1002P` 都指向
  `LAWS1002`），因此不是一对一关系。
- 触发器阻止链式关系：一个编号不能既是 primary 又是 equivalent。

## 读取行为

- `course_catalog` 视图只返回 primary 行，并附带 `equivalent_codes text[]`。
- `resolve_course_code(code)` 把任意编号解析成 primary。
- `course_group_codes(code)` 返回 `[primary, ...equivalents]`。
- 课程页 / 评价页显示 `CSCI1001 a.k.a CISC1001`。
- 教师、评论、排课读取整个 group：
  - `prof_with_course` 按教师名去重；
  - 评论所在行优先（旧编号行）；
  - `is_offered` 取 group 内最大值；
  - 排课合并新旧两边的 `offer/schedule`。
- 旧编号 URL 通过 `next.config.js` 的 redirects 做 **308** 跳转；页面组件里
  还有 `permanentRedirect` 作为动态兜底。

## 数据更新时

`lib/update/tasks/check-courses.ts` 对每个新编号：

1. 抓 UM 课程信息；
2. 调 `admin_match_course_equivalences`，用「标题 + 4 位数字 + 描述/学分」
   匹配旧编号；
3. 排除本次同步批次里的所有编号，避免 `TLL1002C` 和 `TLL1002P` 互相匹配；
4. 只有唯一最高分且超过阈值才自动确认；
5. 课程行和等价关系在 `admin_upsert_offered_courses` 里**同一事务**写入。

`admin_mark_offered`、`admin_apply_schedule` 内部都会先
`resolve_course_code`，所以 Excel 里出现旧编号时，教师/排课仍会写到新编号下。

## 后台手工维护

`/admin/courses` 编辑弹窗里有 **Course equivalences**：

- 显示当前 primary；
- 输入逗号分隔的旧编号后保存，会调用
  `admin_set_course_equivalences`，并写 `admin_audit_log`；
- 删除某个旧编号后，它不再重定向/共享数据。

API：

```
GET  /api/admin/courses/:code/equivalences
POST /api/admin/courses/:code/equivalences
     { "equivalent_codes": ["CISC1001"] }
```

`:code` 可以是旧编号，接口会先解析到 primary。

## 旧 URL 的 308 列表

`next.config.js` 读取 `lib/course-equivalences.generated.json`。数据变更后运行：

```bash
npm run equivalences:redirects
```

然后重新构建/部署。没有重新生成时，页面里的 `permanentRedirect` 仍会把
浏览器带到新编号，但 HTTP 状态可能先返回 200 再由客户端跳转。

## 验证 SQL

```sql
-- 等价关系数量
select count(*) from public.course_equivalences;

-- 某门课的 group
select public.course_group_codes('CSCI1001');
-- => {CSCI1001,CISC1001}

-- 规范目录行
select "New_code", equivalent_codes
from public.course_catalog
where "New_code" = 'CSCI1001';

-- 旧编号搜索返回新编号
select "New_code" from public.search_courses('CISC1001');
```

## 已知限制

- 评论 `comment.course_id` 仍指向旧编号的 `prof_with_course.id`，不搬迁数据。
- 同一个教师如果在旧/新两边都有 `prof_with_course` 行，评价页选择评论较多的
  一行；如果两边以后都产生评论，需要再补一个跨行合并评论列表的迁移。
- 旧编号被多个新编号共享时（TLL C/P），旧 URL 只跳转到排序后的第一个 primary。
