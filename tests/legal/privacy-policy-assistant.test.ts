import { describe, expect, it } from "vitest";

import { privacyPolicy } from "@/lib/privacy-policy";

describe("privacy policy: AI assistant", () => {
  it.each(["zh", "en"] as const)("%s names DeepSeek, its location and that chats are not stored", (language) => {
    const text = JSON.stringify(privacyPolicy[language]);
    expect(text).toContain("DeepSeek");
    expect(text).toMatch(language === "zh" ? /中國內地/ : /Mainland China/);
    expect(text).toMatch(language === "zh" ? /不保存對話內容/ : /does not store conversation content/);
  });
});
