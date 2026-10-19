import { describe, expect, it } from "vitest";

import { CHINESE_SCRIPT_PAIRS, detectChineseScript, replyScriptContext } from "@/lib/assistant/reply-script";

describe("detectChineseScript", () => {
  it.each([
    ["ACCT1000 难不难？", "simplified"],
    ["哪个老师给分比较好", "simplified"],
    ["这门课要不要点名", "simplified"],
    ["ACCT1000 難唔難讀？", "traditional"],
    ["這門課難嗎？", "traditional"],
    ["邊個老師俾分好啲", "traditional"],
  ] as const)("reads %s as %s", (text, script) => {
    expect(detectChineseScript(text)).toBe(script);
  });

  it.each(["ACCT1000", "Is ACCT1000 hard?", "ACCT1000 好唔好", "日本語で答えてください"])(
    "has no opinion on %s",
    (text) => {
      expect(detectChineseScript(text)).toBeNull();
    },
  );
});

describe("CHINESE_SCRIPT_PAIRS", () => {
  it("uses two distinct characters per pair with no overlap between scripts", () => {
    const simplified = new Set<string>();
    const traditional = new Set<string>();
    for (const pair of CHINESE_SCRIPT_PAIRS.split(" ")) {
      const chars = Array.from(pair);
      expect(chars).toHaveLength(2);
      expect(chars[0]).not.toBe(chars[1]);
      simplified.add(chars[0]!);
      traditional.add(chars[1]!);
    }
    for (const char of simplified) {
      expect(traditional.has(char)).toBe(false);
    }
  });
});

const user = (content: unknown) => ({ id: "u", role: "user", content });
const assistant = (content: string) => ({ id: "a", role: "assistant", content });

describe("replyScriptContext", () => {
  it("names the script of the latest user message", () => {
    const entry = replyScriptContext([user("這門課難嗎？"), assistant("…"), user("ACCT1000 难不难？")]);

    expect(entry?.value).toContain("Simplified Chinese");
    expect(entry?.value).not.toMatch(/[\p{Script=Han}]/u);
  });

  it("reads text parts of multi-part messages", () => {
    const entry = replyScriptContext([user([{ type: "text", text: "這門課難嗎？" }])]);

    expect(entry?.value).toContain("Traditional Chinese");
  });

  it("adds nothing when the latest message has no distinctive script, so the conversation language holds", () => {
    expect(replyScriptContext([user("这门课难吗？"), assistant("…"), user("ACCT1000")])).toBeNull();
    expect(replyScriptContext([user("Is ACCT1000 hard?")])).toBeNull();
    expect(replyScriptContext([])).toBeNull();
  });

  it("adds nothing when the student asked for a non-Chinese language earlier", () => {
    expect(
      replyScriptContext([
        user("From now on please answer in Japanese."),
        assistant("承知しました。"),
        user("ACCT1000 难不难？"),
      ]),
    ).toBeNull();
  });
});
