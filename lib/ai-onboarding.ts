import { MCP_RESOURCE_URL } from "@/lib/mcp/constants";
import { SITE_URL } from "@/lib/site";

/**
 * Distribution + onboarding data for the "use it in your AI tools" page (`/ai`).
 *
 * Why the copy and the links live here instead of inside the page component:
 * the page is mostly *exact technical strings* (a production URL, CLI commands,
 * deep links). Keeping them in one typed module lets the tests assert on data
 * rather than on JSX, and guarantees every surface advertises the same server.
 *
 * Deep links are ALWAYS produced by the builders below, never pasted as literal
 * base64 — the encodings differ per client and hand-copied blobs rot silently.
 *
 * The page is intentionally English-only: it is read once, while a client is being
 * installed, and a second translation only added noise.
 */

/** The one production MCP endpoint every snippet and link must point at. */
export const MCP_PUBLIC_URL = MCP_RESOURCE_URL;

/** Server name used by every client config and by the plugin package. */
export const MCP_SERVER_ID = "what2reg-um";

/** Official MCP Registry identifier (GitHub-based namespace, see spec §5.1). */
export const MCP_REGISTRY_NAME = "io.github.UMHelper/what2reg-um";

/**
 * Flipped to `true` only after `mcp-publisher publish` succeeded. The page hides
 * the registry pointer button while this is false, so we never ship a link to a
 * registry entry that does not exist yet.
 */
export const MCP_REGISTRY_PUBLISHED = false;

/** Repository that hosts the Codex marketplace (`.agents/plugins/marketplace.json`). */
export const MCP_REPOSITORY = "UMHelper/next-web";
export const MCP_MARKETPLACE = "what2reg-local";

/** Pointer button: resolves the registry entry at click time (spec §3.3). */
export const MCP_REGISTRY_BUTTON_URL = `https://install.apicommons.org/?name=${encodeURIComponent(MCP_REGISTRY_NAME)}`;

/**
 * base64 of a UTF-8 string.
 *
 * `btoa` alone throws on non-ASCII, and the reference client implementations use
 * `btoa(unescape(encodeURIComponent(…)))`. This is the same transformation
 * without the deprecated `unescape`, and it behaves identically in Node and the
 * browser.
 */
function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Cursor accepts a base64 config without a `type` field (spec §5.4). */
function cursorConfig(): string {
  return toBase64Utf8(JSON.stringify({ url: MCP_PUBLIC_URL }));
}

/** VS Code requires `type`, and takes URL-encoded JSON rather than base64. */
function vscodeConfig(): string {
  return encodeURIComponent(JSON.stringify({ type: "http", url: MCP_PUBLIC_URL }));
}

export function buildCursorDeeplink(): string {
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_ID}&config=${cursorConfig()}`;
}

export function buildCursorWebDeeplink(): string {
  return `https://cursor.com/en/install-mcp?name=${MCP_SERVER_ID}&config=${encodeURIComponent(cursorConfig())}`;
}

export function buildVscodeDeeplink(insiders = false): string {
  const host = insiders ? "insiders.vscode.dev" : "vscode.dev";
  const quality = insiders ? "&quality=insiders" : "";
  return `https://${host}/redirect/mcp/install?name=${MCP_SERVER_ID}&config=${vscodeConfig()}${quality}`;
}

export function buildLmStudioDeeplink(): string {
  return `lmstudio://add_mcp?name=${MCP_SERVER_ID}&config=${encodeURIComponent(cursorConfig())}`;
}

export function buildGooseDeeplink(): string {
  const params = new URLSearchParams({
    url: MCP_PUBLIC_URL,
    type: "streamable_http",
    id: MCP_SERVER_ID,
    name: "What2REG@UM",
    description: "University of Macau course, instructor and review data",
  });
  return `goose://extension?${params.toString()}`;
}

export function buildVscodeCliCommand(): string {
  return `code --add-mcp '${JSON.stringify({ name: MCP_SERVER_ID, type: "http", url: MCP_PUBLIC_URL })}'`;
}

export function buildClaudeCliCommand(): string {
  return `claude mcp add --transport http ${MCP_SERVER_ID} ${MCP_PUBLIC_URL}`;
}

export function buildCodexCommands(): string {
  return [
    `codex plugin marketplace add ${MCP_REPOSITORY}`,
    `codex plugin add ${MCP_SERVER_ID}@${MCP_MARKETPLACE}`,
  ].join("\n");
}

/** Config snippet for any client that reads an `mcpServers` JSON block. */
export function buildGenericMcpJson(): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER_ID]: { url: MCP_PUBLIC_URL } } }, null, 2);
}

/** Icon key resolved by `components/ai-client-icons.tsx`. */
export type AiClientIconId = "vscode" | "cursor" | "openai" | "claude" | "generic" | "askai";

export type AiClientMethod = {
  /** Shown only when a client offers more than one way in (e.g. ChatGPT vs Codex). */
  label?: string;
  steps: string[];
  snippetLabel?: string;
  snippet?: string;
  href?: string;
  hrefLabel?: string;
};

export type AiClientBlock = {
  id: string;
  icon: AiClientIconId;
  /** Short label under the icon in the picker row. */
  label: string;
  heading: string;
  /** Precondition. Never optional: the paid gates matter (spec §3.4). */
  requirement: string;
  methods: AiClientMethod[];
};

export type AiOnboardingContent = {
  /** Sentence around the brand name; only the name itself carries the gradient. */
  titleBefore: string;
  titleAfter: string;
  pickLabel: string;
  clients: AiClientBlock[];
  copyLabel: string;
  copiedLabel: string;
};

/**
 * The prompt a reader can paste into an agentic client (Codex, Cursor, Copilot in
 * agent mode, Claude Code) so the assistant writes the config and verifies it.
 *
 * Kept in one place and rendered verbatim — a prompt that drifts from the real URL
 * or tool names is worse than no prompt at all, and the tests pin both.
 */
export const INSTALL_PROMPT = `Add the What2REG@UM MCP server to this AI client, then verify it works.

  name:  ${MCP_SERVER_ID}
  url:   ${MCP_PUBLIC_URL}   (remote Streamable HTTP; OAuth 2.1 on first use)
  scope: umhelper:read — read-only

Add it where this client keeps MCP servers:
  VS Code/Copilot  code --add-mcp '{"name":"${MCP_SERVER_ID}","type":"http","url":"${MCP_PUBLIC_URL}"}'
  Cursor           ~/.cursor/mcp.json → {"mcpServers":{"${MCP_SERVER_ID}":{"url":"${MCP_PUBLIC_URL}"}}}
  Claude Code      claude mcp add --transport http ${MCP_SERVER_ID} ${MCP_PUBLIC_URL}
  Codex            codex plugin marketplace add ${MCP_REPOSITORY} && codex plugin add ${MCP_SERVER_ID}@${MCP_MARKETPLACE}

Then reload the server, complete the sign-in page, and verify by calling get_course with
ACCT1000 — show me the instructor list and its ${SITE_URL} link. Tell me which client you are
in and what you changed. The server exposes exactly five read-only tools; do not invent others.`;

export const aiOnboarding: AiOnboardingContent = {
  titleBefore: "Use",
  titleAfter: "in AI",
  pickLabel: "Pick your app",
  clients: [
    {
      id: "vscode",
      icon: "vscode",
      label: "VS Code",
      heading: "VS Code + GitHub Copilot",
      requirement: "Recommended. Verified students get GitHub Copilot free.",
      methods: [
        {
          steps: [
            "Command Palette (\u21e7\u2318P) \u2192 \u201cMCP: Add Server\u201d.",
            "Choose HTTP, name it what2reg-um, paste the URL.",
            "Sign in to umeh.top when the browser opens, then approve.",
          ],
          snippetLabel: "Or from a terminal",
          snippet: buildVscodeCliCommand(),
          href: buildVscodeDeeplink(),
          hrefLabel: "Add to VS Code",
        },
      ],
    },
    {
      id: "cursor",
      icon: "cursor",
      label: "Cursor",
      heading: "Cursor",
      requirement: "Cursor's free tier can run MCP servers.",
      methods: [
        {
          steps: [
            "Settings \u2192 MCP \u2192 Add new MCP server.",
            "Paste the URL, then sign in to umeh.top.",
          ],
          snippetLabel: "Or add it to ~/.cursor/mcp.json",
          snippet: buildGenericMcpJson(),
          href: buildCursorDeeplink(),
          hrefLabel: "Add to Cursor",
        },
      ],
    },
    {
      id: "openai",
      icon: "openai",
      label: "ChatGPT",
      heading: "ChatGPT / Codex",
      requirement: "Needs ChatGPT Plus or above \u2014 Free and Go cannot add connectors or plugins.",
      methods: [
        {
          label: "ChatGPT",
          steps: [
            "Settings \u2192 Connectors \u2192 turn on Developer mode.",
            "Paste the server URL and approve the read-only access.",
          ],
          snippetLabel: "Server URL",
          snippet: MCP_PUBLIC_URL,
        },
        {
          label: "Codex",
          steps: ["Run both commands, then restart the ChatGPT desktop app."],
          snippetLabel: "Terminal",
          snippet: buildCodexCommands(),
        },
      ],
    },
    {
      id: "claude",
      icon: "claude",
      label: "Claude Code",
      heading: "Claude Code",
      requirement: "Needs a Claude plan that includes Claude Code.",
      methods: [
        {
          steps: ["Run this command, then sign in to umeh.top."],
          snippetLabel: "Terminal",
          snippet: buildClaudeCliCommand(),
        },
      ],
    },
    {
      id: "generic",
      icon: "generic",
      label: "Other",
      heading: "Any other MCP client",
      requirement: "Needs remote MCP support (Streamable HTTP + OAuth).",
      methods: [
        {
          steps: ["Add this block to your client's MCP config."],
          snippetLabel: "mcpServers block",
          snippet: buildGenericMcpJson(),
        },
      ],
    },
    {
      id: "askai",
      icon: "askai",
      label: "Ask AI",
      heading: "Ask your AI to install it",
      requirement: "Works with any assistant that can edit files or run commands.",
      methods: [
        {
          steps: [
            "Copy the prompt.",
            "Paste it into your AI chat and send.",
            "Let it write the config, then confirm it verified.",
          ],
          snippetLabel: "Prompt",
          snippet: INSTALL_PROMPT,
        },
      ],
    },
  ],
  copyLabel: "Copy",
  copiedLabel: "Copied",
};
