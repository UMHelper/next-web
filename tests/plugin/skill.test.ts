import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

/**
 * What2Reg @ UM `um-course-advisor` skill behaviour test (plan Task 11).
 *
 * The skill is the model-facing contract for the plugin, so these assertions
 * check the instructions themselves: only the five approved read-only tools may
 * be named, factual answers must keep the returned reference URLs, missing
 * data must be resolved by calling the search/detail tools instead of inventing
 * offerings or ratings, and write/profile/SQL/arbitrary-URL requests must be
 * refused with actionable but non-leaking error guidance.
 */

const REPO_ROOT = process.cwd();
const SKILL_PATH = join(REPO_ROOT, "plugins", "what2reg-um", "skills", "um-course-advisor", "SKILL.md");
const TOOLS_DIR = join(REPO_ROOT, "lib", "mcp", "tools");

const APPROVED_TOOLS = [
  "search_catalog",
  "get_course",
  "get_instructor",
  "get_course_reviews",
  "get_course_sections",
] as const;

const source = readFileSync(SKILL_PATH, "utf8");

/** Every snake_case token in the document must be one of the approved tools. */
function referencedSnakeCaseTokens(): string[] {
  return Array.from(source.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g), (match) => match[0]);
}

describe("SKILL.md frontmatter", () => {
  const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---\n/);
  const frontmatter = frontmatterMatch ? parseYaml(frontmatterMatch[1]) : null;

  it("has parseable frontmatter with the skill name and a description", () => {
    expect(frontmatterMatch).not.toBeNull();
    expect(frontmatter.name).toBe("um-course-advisor");
    expect(typeof frontmatter.description).toBe("string");
    expect(frontmatter.description.trim().length).toBeGreaterThan(20);
    expect(frontmatter.description.length).toBeLessThanOrEqual(1024);
  });
});

describe("approved tool surface", () => {
  it("references only the five approved read-only tools", () => {
    const referenced = new Set(referencedSnakeCaseTokens());
    for (const token of referenced) {
      expect(APPROVED_TOOLS, `SKILL.md must not reference unapproved tool "${token}"`).toContain(token);
    }
    for (const tool of APPROVED_TOOLS) {
      expect(source, `SKILL.md must document ${tool}`).toContain(tool);
    }
  });

  it("matches the tool inventory actually registered by the MCP server", () => {
    const declared = readdirSync(TOOLS_DIR).flatMap((file) =>
      Array.from(
        readFileSync(join(TOOLS_DIR, file), "utf8").matchAll(
          /export const [A-Z_]+_TOOL_NAME = "([a-z_]+)"/g,
        ),
        (match) => match[1],
      ),
    );
    expect(new Set(declared)).toEqual(new Set(APPROVED_TOOLS));
  });
});

describe("factual answers keep reference URLs", () => {
  it("requires citing the returned https://umeh.top links", () => {
    expect(source).toMatch(/https:\/\/umeh\.top/);
    expect(source).toMatch(/保留[^。\n]*引用/);
    expect(source).toMatch(/(引用|链接)[^。\n]*(必须|都要|一律)|必须[^。\n]*(引用|链接)/);
  });

  it("forbids presenting outside knowledge as UMHelper data", () => {
    expect(source).toMatch(/(站外|外部|第三方)[^。\n]*知识/);
    expect(source).toMatch(/(不得|不要|禁止|绝不)[^。\n]*(包装|冒充|当作)[^。\n]*(UMHelper|What2Reg)/i);
  });
});

describe("missing information", () => {
  it("requires calling search/detail tools before answering", () => {
    expect(source).toContain("search_catalog");
    expect(source).toMatch(/(先|首先)[^。\n]*调用[^。\n]*search_catalog/);
    expect(source).toMatch(/get_course|get_instructor/);
  });

  it("forbids inventing offerings, sections, instructors or ratings", () => {
    expect(source).toMatch(/(绝不|不得|不要|禁止)[^。\n]*(编造|虚构|猜测|臆测)/);
    expect(source).toMatch(/(开课|班次|教师|评分|评价)/);
  });
});

describe("forbidden actions", () => {
  it("refuses writing or modifying reviews", () => {
    expect(source).toMatch(/(不得|不要|禁止|绝不)[^。\n]*(撰写|写|发表|提交|修改|删除)[^。\n]*评价/);
  });

  it("refuses reading user profiles or personal timetables", () => {
    expect(source).toMatch(/(不得|不要|禁止|绝不)[^。\n]*(个人课表|用户资料|个人资料)/);
    expect(source).toMatch(/(投票记录|私有数据|其他用户)/);
  });

  it("refuses arbitrary URL access and SQL or bulk export", () => {
    expect(source).toMatch(/(不得|不要|禁止|绝不)[^。\n]*(任意 ?URL|站外网页|抓取)/i);
    expect(source).toMatch(/(不得|不要|禁止|绝不)[^。\n]*SQL/i);
    expect(source).toMatch(/(批量导出|导出全部|全库导出)/);
  });
});

describe("comparisons follow user preference", () => {
  it("organises comparisons by preference instead of official conclusions", () => {
    expect(source).toMatch(/偏好/);
    expect(source).toMatch(/(评分|评价)[^。\n]*(不代表|并非|不是)[^。\n]*官方/);
    expect(source).toMatch(/官方结论/);
  });
});

describe("error handling", () => {
  it("explains not-found, rate-limited and auth failures actionably", () => {
    expect(source).toMatch(/(未找到|没有匹配|无匹配)/);
    expect(source).toMatch(/限流/);
    expect(source).toMatch(/(鉴权失败|授权失败|重新登录|重新授权)/);
  });

  it("never leaks internals when explaining failures", () => {
    expect(source).toMatch(/(不要|不得|禁止)[^。\n]*(泄露|暴露|输出)[^。\n]*内部/);
    expect(source).toMatch(/(堆栈|token|数据库错误|内部 ID)/i);
  });
});

describe("execution boundaries", () => {
  it("states that only the bundled what2reg-um server may be used", () => {
    expect(source).toMatch(/what2reg-um/);
    expect(source).toMatch(/(只读|read-only)/i);
  });
});
