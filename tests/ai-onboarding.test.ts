import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SITE_URL } from "@/lib/site";
import {
  INSTALL_PROMPT,
  MCP_PUBLIC_URL,
  MCP_REGISTRY_BUTTON_URL,
  MCP_REGISTRY_NAME,
  MCP_REGISTRY_PUBLISHED,
  MCP_REPOSITORY,
  MCP_SERVER_ID,
  aiOnboarding,
  buildClaudeCliCommand,
  buildCodexCommands,
  buildCursorDeeplink,
  buildGenericMcpJson,
  buildGooseDeeplink,
  buildLmStudioDeeplink,
  buildVscodeCliCommand,
  buildVscodeDeeplink,
  buildVscodeWebDeeplink,
} from "@/lib/ai-onboarding";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const REGISTRY_MANIFEST = "mcp/server.json";
const PLUGIN_MANIFEST = "plugins/what2reg-um/plugin.json";
const AI_PAGE = "app/ai/page.tsx";

describe("mcp/server.json (MCP Registry entry)", () => {
  const serverJson = JSON.parse(read(REGISTRY_MANIFEST));

  it("uses the GitHub-authenticated namespace we can actually publish under", () => {
    expect(serverJson.name).toBe(MCP_REGISTRY_NAME);
    expect(serverJson.name).toMatch(/^io\.github\.UMHelper\/[a-z0-9._-]+$/);
  });

  it("declares exactly the production remote endpoint", () => {
    expect(serverJson.remotes).toHaveLength(1);
    expect(serverJson.remotes[0]).toMatchObject({
      type: "streamable-http",
      url: MCP_PUBLIC_URL,
    });
  });

  it("keeps the version in lockstep with the plugin package", () => {
    const pluginJson = JSON.parse(read(PLUGIN_MANIFEST));
    expect(serverJson.version).toBe(pluginJson.version);
  });

  it("ships an icon so clients can show a logo", () => {
    // Without icons, registry-driven UIs (VS Code's MCP view among them) render the
    // server as a bare name. The schema requires HTTPS sources.
    expect(Array.isArray(serverJson.icons)).toBe(true);
    expect(serverJson.icons.length).toBeGreaterThan(0);
    for (const icon of serverJson.icons) {
      expect(icon.src).toMatch(/^https:\/\//);
      expect(icon.mimeType).toBe("image/png");
      expect(icon.sizes?.[0]).toMatch(/^\d+x\d+$/);
    }
    // The file we point at has to exist in this repo, or clients get a 404.
    expect(serverJson.icons.some((i: { src: string }) => i.src.includes("umeh.top/icon/"))).toBe(true);
  });

  it("keeps the description within the registry's 100-character limit", () => {
    // The JSON Schema has no maxLength here, but registry.modelcontextprotocol.io
    // rejects anything longer with a 422 — caught by `mcp-publisher validate`.
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
    expect(serverJson.description.length).toBeGreaterThan(20);
  });

  it("contains no credentials", () => {
    const serialized = JSON.stringify(serverJson).toLowerCase();
    for (const forbidden of ["token", "secret", "password", "bearer", "apikey", "api_key"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("install links (generated, never hand-written)", () => {
  it("Cursor carries base64 JSON without a type field", () => {
    const link = buildCursorDeeplink();
    expect(link.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?")).toBe(true);

    const config = new URLSearchParams(link.split("?")[1]).get("config") ?? "";
    expect(JSON.parse(Buffer.from(config, "base64").toString("utf8"))).toEqual({
      url: MCP_PUBLIC_URL,
    });
  });

  it("VS Code carries URL-encoded JSON and requires a type field", () => {
    const link = buildVscodeDeeplink();
    // The direct scheme, not the vscode.dev redirect: the redirect drops `config`
    // and the install dialog opens with an empty URL (verified 2026-10-15).
    expect(link.startsWith("vscode:mcp/install?")).toBe(true);
    expect(link).not.toContain("vscode.dev/redirect");

    const config = new URLSearchParams(link.split("?")[1]).get("config") ?? "";
    expect(JSON.parse(config)).toEqual({ type: "http", url: MCP_PUBLIC_URL });
  });

  it("keeps the web-redirect form only as a labelled fallback", () => {
    const link = buildVscodeWebDeeplink(true);
    expect(link).toContain("https://insiders.vscode.dev/redirect/mcp/install?");
    expect(link).toContain("&quality=insiders");
  });

  it("LM Studio and Goose carry the same endpoint", () => {
    const lm = new URLSearchParams(buildLmStudioDeeplink().split("?")[1]).get("config") ?? "";
    expect(JSON.parse(Buffer.from(lm, "base64").toString("utf8"))).toEqual({ url: MCP_PUBLIC_URL });
    expect(buildGooseDeeplink()).toContain(encodeURIComponent(MCP_PUBLIC_URL));
    expect(buildGooseDeeplink()).toContain("type=streamable_http");
  });

  it("CLI commands name the server and the endpoint", () => {
    expect(buildVscodeCliCommand()).toContain(`"url":"${MCP_PUBLIC_URL}"`);
    expect(buildClaudeCliCommand()).toContain(`--transport http ${MCP_SERVER_ID} ${MCP_PUBLIC_URL}`);
    expect(buildCodexCommands()).toContain(`codex plugin add ${MCP_SERVER_ID}@`);
  });

  it("the generic config block is valid JSON pointing at the endpoint", () => {
    expect(JSON.parse(buildGenericMcpJson())).toEqual({
      mcpServers: { [MCP_SERVER_ID]: { url: MCP_PUBLIC_URL } },
    });
  });

  it("never embeds credentials in a link", () => {
    const links = [
      buildCursorDeeplink(),
      buildVscodeDeeplink(),
      buildVscodeWebDeeplink(true),
      buildLmStudioDeeplink(),
      buildGooseDeeplink(),
      MCP_REGISTRY_BUTTON_URL,
    ];
    for (const link of links) {
      const lowered = link.toLowerCase();
      for (const forbidden of ["token", "secret", "bearer", "password", "client_secret"]) {
        expect(lowered).not.toContain(forbidden);
      }
    }
  });

  it("advertises the registry pointer only because the entry is live", () => {
    // Published 2026-10-15 (io.github.UMHelper/what2reg-um@0.1.0, status active).
    // The flag stays in the code so a future unpublished name cannot leak a 404 link.
    expect(MCP_REGISTRY_PUBLISHED).toBe(true);
    expect(read(AI_PAGE)).toContain("MCP_REGISTRY_PUBLISHED &&");
    expect(MCP_REGISTRY_BUTTON_URL).toContain(encodeURIComponent(MCP_REGISTRY_NAME));
  });
});

describe("onboarding copy", () => {
  it("gives every client block an explicit precondition and at least one method", () => {
    expect(aiOnboarding.clients.length).toBeGreaterThanOrEqual(5);

    for (const client of aiOnboarding.clients) {
      expect(client.requirement.trim().length, `${client.id} requirement`).toBeGreaterThan(10);
      expect(client.methods.length, `${client.id} methods`).toBeGreaterThan(0);
      for (const method of client.methods) {
        expect(method.steps.length, `${client.id} steps`).toBeGreaterThan(0);
      }
    }
  });

  it("gives every client a distinct icon and a short picker label", () => {
    const icons = new Set<string>();

    for (const client of aiOnboarding.clients) {
      expect(client.label.length, `${client.id} label`).toBeLessThanOrEqual(12);
      icons.add(client.icon);
    }

    // The picker row relies on the icons being distinguishable.
    expect(icons.size).toBe(6);
  });

  it("warns that the OpenAI paths need a paid plan", () => {
    const openai = aiOnboarding.clients.find((c) => c.id === "openai");
    expect(openai?.requirement).toMatch(/Plus/);
    // Both entry points live in the same block, so both must be covered.
    expect(openai?.methods.map((m) => m.label)).toEqual(["ChatGPT", "Codex"]);
  });

  it("points at the production endpoint and never a placeholder", () => {
    const serialized = JSON.stringify(aiOnboarding);
    expect(serialized).toContain(MCP_PUBLIC_URL);
    for (const placeholder of ["example.com", "localhost", "<", "TODO"]) {
      expect(serialized).not.toContain(placeholder);
    }
  });

  it("keeps the reader's visible text short", () => {
    // The first version of this page was rejected for having too much prose. Lock
    // that in: one short title, one short line, then the icon row.
    // Only the wrapper words live here; the brand name is injected by the page.
    expect(`${aiOnboarding.titleBefore} ${aiOnboarding.titleAfter}`.length).toBeLessThanOrEqual(20);
    expect(aiOnboarding.pickLabel.length).toBeLessThanOrEqual(16);

    for (const client of aiOnboarding.clients) {
      expect(client.methods.length, `${client.id} methods`).toBeLessThanOrEqual(2);
      for (const method of client.methods) {
        expect(method.steps.length, `${client.id} steps`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("keeps the page to the picker only", () => {
    // The "Good to know" disclosure block and the bottom "Support" button were both
    // removed on request: this page installs a client, it is not a documentation hub.
    const lib = read("lib/ai-onboarding.ts");
    const page = read(AI_PAGE);

    expect(lib).not.toContain("notesHeading");
    expect(lib).not.toContain("supportHref");
    expect(page).not.toContain("<details");
    expect(page).not.toContain("/support");
  });

  it("ships a paste-into-your-agent install prompt as a normal client entry", () => {
    // "Ask AI" is not a page footer: it is the sixth entry in the same picker, with the
    // same shape as every other client — steps plus a snippet, the snippet being the prompt.
    const askAi = aiOnboarding.clients.find((client) => client.id === "askai");

    expect(askAi?.icon).toBe("askai");
    expect(askAi?.heading).toBe("Ask your AI to install it");
    expect(askAi?.requirement.length).toBeGreaterThan(10);
    expect(askAi?.methods).toHaveLength(1);
    expect(askAi?.methods[0].snippet).toBe(INSTALL_PROMPT);
    expect(askAi?.methods[0].steps.length).toBeGreaterThanOrEqual(2);

    // The prompt must name the real endpoint, the real repo and a real tool to verify with.
    expect(INSTALL_PROMPT).toContain(MCP_PUBLIC_URL);
    expect(INSTALL_PROMPT).toContain(MCP_SERVER_ID);
    expect(INSTALL_PROMPT).toContain(MCP_REPOSITORY);
    expect(INSTALL_PROMPT).toContain(buildVscodeCliCommand());
    expect(INSTALL_PROMPT).toContain(buildClaudeCliCommand());
    expect(INSTALL_PROMPT).toContain("get_course");
    expect(INSTALL_PROMPT).toContain("ACCT1000");
    expect(INSTALL_PROMPT).toMatch(/exactly five read-only tools/i);
    expect(INSTALL_PROMPT).toContain("do not invent others");

    // It is pasted into a chat: no secrets, and compact enough to skim.
    for (const forbidden of ["token", "secret", "bearer", "password", "client_secret"]) {
      expect(INSTALL_PROMPT.toLowerCase()).not.toContain(forbidden);
    }
    expect(INSTALL_PROMPT.length).toBeLessThanOrEqual(1000);
  });

  it("never points at something by screen position", () => {
    // The panel is two columns on desktop and stacked on mobile, so "below" is wrong in
    // one of the two layouts. Every step has to stand on its own wording.
    const steps = aiOnboarding.clients.flatMap((client) =>
      client.methods.flatMap((method) => method.steps),
    );

    for (const step of steps) {
      expect(step, step).not.toMatch(/\b(below|above|on the left|on the right|left-hand|right-hand)\b/i);
    }
  });

  it("never tells people to sign in with the team name", () => {
    // UMHelper is the developer team, not an account and not a product (spec §11.1).
    // The reader's account is their umeh.top account, so every sign-in step must say so.
    const steps = aiOnboarding.clients.flatMap((client) =>
      client.methods.flatMap((method) => method.steps),
    );

    expect(JSON.stringify(aiOnboarding)).not.toMatch(/sign in with UMHelper/i);

    const signInSteps = steps.filter((step) => /sign in/i.test(step));
    expect(signInSteps.length).toBeGreaterThanOrEqual(3);
    for (const step of signInSteps) {
      expect(step, step).toContain(new URL(SITE_URL).host);
    }

    // The prompt must not invent an account name either.
    expect(INSTALL_PROMPT).not.toMatch(/sign in with UMHelper/i);
  });

  it("stays English-only, with no translation switch to maintain", () => {
    expect(read("lib/ai-onboarding.ts")).not.toContain("aiOnboardingZh");
    expect(read(AI_PAGE)).not.toContain("lang=zh");
    expect(read(AI_PAGE)).not.toContain("zh-Hant");
  });
});

describe("/ai page wiring", () => {
  const page = read(AI_PAGE);

  it("is indexable with a canonical URL", () => {
    expect(page).not.toContain("noIndexMetadata");
    expect(page).toContain("canonical: '/ai'");
  });

  it("is listed in the sitemap", () => {
    expect(read("app/sitemap.ts")).toContain('absoluteUrl("/ai")');
  });
});
