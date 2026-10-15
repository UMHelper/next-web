import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MCP_PUBLIC_URL,
  MCP_REGISTRY_BUTTON_URL,
  MCP_REGISTRY_NAME,
  MCP_REGISTRY_PUBLISHED,
  MCP_SERVER_ID,
  aiOnboardingEn,
  aiOnboardingZh,
  buildClaudeCliCommand,
  buildCodexCommands,
  buildCursorDeeplink,
  buildGenericMcpJson,
  buildGooseDeeplink,
  buildLmStudioDeeplink,
  buildVscodeCliCommand,
  buildVscodeDeeplink,
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
    expect(link.startsWith("https://vscode.dev/redirect/mcp/install?")).toBe(true);

    const config = new URLSearchParams(link.split("?")[1]).get("config") ?? "";
    expect(JSON.parse(config)).toEqual({ type: "http", url: MCP_PUBLIC_URL });
  });

  it("VS Code Insiders uses the Insiders host and quality flag", () => {
    const link = buildVscodeDeeplink(true);
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
      buildVscodeDeeplink(true),
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

  it("keeps the registry pointer behind a published flag", () => {
    // The page must not advertise a registry entry before it exists (spec §9 U1).
    expect(MCP_REGISTRY_PUBLISHED).toBe(false);
    expect(read(AI_PAGE)).toContain("MCP_REGISTRY_PUBLISHED &&");
    expect(MCP_REGISTRY_BUTTON_URL).toContain(encodeURIComponent(MCP_REGISTRY_NAME));
  });
});

describe("onboarding copy", () => {
  it("gives every client block an explicit precondition", () => {
    for (const content of [aiOnboardingEn, aiOnboardingZh]) {
      expect(content.clients.length).toBeGreaterThanOrEqual(5);
      for (const client of content.clients) {
        expect(client.requirement.trim().length, `${client.id} requirement`).toBeGreaterThan(20);
        expect(client.steps.length, `${client.id} steps`).toBeGreaterThan(0);
      }
    }
  });

  it("warns that ChatGPT and Codex need a paid plan", () => {
    for (const content of [aiOnboardingEn, aiOnboardingZh]) {
      const chatgpt = content.clients.find((c) => c.id === "chatgpt");
      const codex = content.clients.find((c) => c.id === "codex");
      expect(chatgpt?.requirement).toMatch(/Plus|付費|付费/);
      expect(codex?.requirement).toMatch(/Plus|付費|付费/);
    }
  });

  it("points at the production endpoint and never a placeholder", () => {
    const serialized = JSON.stringify([aiOnboardingEn, aiOnboardingZh]);
    expect(serialized).toContain(MCP_PUBLIC_URL);
    for (const placeholder of ["example.com", "localhost", "<", "TODO"]) {
      expect(serialized).not.toContain(placeholder);
    }
  });

  it("keeps the Chinese page a full translation, not a stub", () => {
    expect(aiOnboardingZh.clients.map((c) => c.id)).toEqual(aiOnboardingEn.clients.map((c) => c.id));
    expect(aiOnboardingZh.dataBullets.length).toBe(aiOnboardingEn.dataBullets.length);
    expect(aiOnboardingZh.authParagraphs.length).toBe(aiOnboardingEn.authParagraphs.length);
  });
});

describe("/ai page wiring", () => {
  const page = read(AI_PAGE);

  it("is indexable and bilingual", () => {
    expect(page).not.toContain("noIndexMetadata");
    expect(page).toContain("canonical: '/ai'");
    expect(page).toContain("'zh-Hant': '/ai?lang=zh'");
  });

  it("is listed in the sitemap", () => {
    expect(read("app/sitemap.ts")).toContain('absoluteUrl("/ai")');
  });
});
