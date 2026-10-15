import { MCP_RESOURCE_URL } from "@/lib/mcp/constants";
import { SITE_NAME, SITE_URL } from "@/lib/site";

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

export type AiClientBlock = {
  id: string;
  heading: string;
  /** Precondition shown above the steps. Never optional: the paid gates matter. */
  requirement: string;
  steps: string[];
  snippetLabel?: string;
  snippet?: string;
  href?: string;
  hrefLabel?: string;
};

export type AiOnboardingContent = {
  title: string;
  updatedLabel: string;
  updatedDate: string;
  intro: string;
  clientsHeading: string;
  clients: AiClientBlock[];
  authHeading: string;
  authParagraphs: string[];
  dataHeading: string;
  dataBullets: string[];
  troubleshootHeading: string;
  troubleshootBullets: string[];
  supportHref: string;
  supportLabel: string;
};

const UPDATED_DATE = "2026-10-15";

export const aiOnboardingEn: AiOnboardingContent = {
  title: `Use ${SITE_NAME} in your AI tools`,
  updatedLabel: "Updated ",
  updatedDate: UPDATED_DATE,
  intro:
    `${SITE_NAME} runs a read-only MCP server, so ChatGPT, Codex, VS Code, Cursor, Claude Code and ` +
    `other MCP clients can look up University of Macau courses, instructors, public reviews and ` +
    `class sections for you. Every factual result keeps its ${SITE_URL} reference link, and no tool ` +
    `can post, edit, vote, export or read private data.`,
  clientsHeading: "Choose your tool",
  clients: [
    {
      id: "vscode",
      heading: "VS Code + GitHub Copilot (recommended)",
      requirement:
        "Needs GitHub Copilot. Verified students get Copilot Student free, and GitHub documents that " +
        "Copilot Free / Pro / Pro+ / Max MCP access is not restricted by organisation policy.",
      steps: [
        "Open the Command Palette (⇧⌘P on macOS, Ctrl+Shift+P on Windows) and run “MCP: Add Server”.",
        "Choose HTTP, name it what2reg-um, and enter the URL below.",
        "Approve the server when VS Code asks, then sign in with your UMHelper account.",
      ],
      snippetLabel: "Or from a terminal",
      snippet: buildVscodeCliCommand(),
      href: buildVscodeDeeplink(),
      hrefLabel: "Add to VS Code",
    },
    {
      id: "cursor",
      heading: "Cursor",
      requirement: "Needs Cursor (its free tier can run MCP servers).",
      steps: [
        "Use the button below, or run “Cursor Settings → MCP → Add new MCP server”.",
        "Paste the URL when asked, then sign in with your UMHelper account.",
      ],
      href: buildCursorDeeplink(),
      hrefLabel: "Add to Cursor",
      snippetLabel: "Config file (~/.cursor/mcp.json)",
      snippet: buildGenericMcpJson(),
    },
    {
      id: "generic",
      heading: "Any other MCP client",
      requirement:
        "Needs a client that supports remote MCP servers over Streamable HTTP with OAuth.",
      steps: [
        "Add the block below to your client's MCP configuration.",
        "Start the server; the client opens the sign-in page on first use.",
      ],
      snippetLabel: "mcpServers block",
      snippet: buildGenericMcpJson(),
    },
    {
      id: "codex",
      heading: "Codex (ChatGPT desktop app or CLI)",
      requirement:
        "Needs a paid ChatGPT plan that includes Codex plugins (Plus or above). Free and Go cannot add " +
        "plugins or connectors.",
      steps: [
        "Run the two commands below.",
        "Restart the ChatGPT desktop app, then start a new chat.",
      ],
      snippetLabel: "Terminal",
      snippet: buildCodexCommands(),
    },
    {
      id: "chatgpt",
      heading: "ChatGPT",
      requirement:
        "Needs a paid ChatGPT plan (Plus or above). Custom connectors and plugins are not available on " +
        "Free or Go, so please check your plan before setting this up.",
      steps: [
        "Open Settings → Connectors and turn on Developer mode.",
        "Choose Add, then enter the server URL below.",
        "Sign in with your UMHelper account and approve the read-only access request.",
      ],
      snippetLabel: "Server URL",
      snippet: MCP_PUBLIC_URL,
    },
  ],
  authHeading: "Signing in",
  authParagraphs: [
    "The first time a tool runs, your client opens the UMHelper sign-in page and then a consent screen listing the requested permission.",
    "The only permission requested is umhelper:read: read public course, instructor, review and class-section data. Nothing is written on your behalf.",
    "You can revoke the authorization at any time from your account settings; the client will simply ask you to sign in again.",
  ],
  dataHeading: "What is and is not sent",
  dataBullets: [
    `Only public data is returned: catalog entries, instructor review summaries, public top-level reviews and class sections, always with ${SITE_URL} reference links.`,
    "Never returned: email addresses, commenter identities, hidden or deleted entries, images, private metadata, personal timetables or administrator notes.",
    "The server never reads your personal timetable and never writes, votes, replies, reports or exports anything.",
    "This is an unofficial student project by the UMHelper developer team and is not an official University of Macau statement.",
  ],
  troubleshootHeading: "If it does not work",
  troubleshootBullets: [
    "Sign-in cancelled or expired: remove the server from your client and add it again to restart the authorization.",
    "No results: check the course code or instructor name; try the search tool first.",
    "Rate limited: wait a moment and retry, or narrow the question.",
    "Still stuck: see the support page for the data-flow summary and how to report a problem.",
  ],
  supportHref: "/support",
  supportLabel: "Plugin support",
};

export const aiOnboardingZh: AiOnboardingContent = {
  title: `在你的 AI 工具裡使用 ${SITE_NAME}`,
  updatedLabel: "更新於 ",
  updatedDate: UPDATED_DATE,
  intro:
    `${SITE_NAME} 提供一個唯讀 MCP 服務，讓 ChatGPT、Codex、VS Code、Cursor、Claude Code 等 MCP 客戶端` +
    `替你查詢澳門大學的課程、教師、公開評價與班次。所有事實結果都會附上 ${SITE_URL} 引用連結；` +
    `任何工具都無法發文、修改、投票、匯出或讀取私人資料。`,
  clientsHeading: "選擇你的工具",
  clients: [
    {
      id: "vscode",
      heading: "VS Code + GitHub Copilot（推薦）",
      requirement:
        "需要 GitHub Copilot。通過學生驗證可免費獲得 Copilot Student；GitHub 文件亦說明 Copilot Free / Pro / " +
        "Pro+ / Max 的 MCP 存取不受組織政策限制。",
      steps: [
        "開啟命令面板（macOS 為 ⇧⌘P，Windows 為 Ctrl+Shift+P），執行「MCP: Add Server」。",
        "選擇 HTTP，命名為 what2reg-um，填入下方網址。",
        "VS Code 詢問時確認啟動，然後用 UMHelper 帳號登入。",
      ],
      snippetLabel: "或在終端機執行",
      snippet: buildVscodeCliCommand(),
      href: buildVscodeDeeplink(),
      hrefLabel: "加入 VS Code",
    },
    {
      id: "cursor",
      heading: "Cursor",
      requirement: "需要 Cursor（其免費方案即可執行 MCP 伺服器）。",
      steps: [
        "點下方的按鈕，或使用「Cursor Settings → MCP → Add new MCP server」。",
        "填入網址後，用 UMHelper 帳號登入。",
      ],
      href: buildCursorDeeplink(),
      hrefLabel: "加入 Cursor",
      snippetLabel: "設定檔（~/.cursor/mcp.json）",
      snippet: buildGenericMcpJson(),
    },
    {
      id: "generic",
      heading: "其他 MCP 客戶端",
      requirement: "需要支援遠端 MCP（Streamable HTTP + OAuth）的客戶端。",
      steps: [
        "把下方設定加入客戶端的 MCP 設定檔。",
        "啟動伺服器；首次使用時客戶端會開啟登入頁。",
      ],
      snippetLabel: "mcpServers 設定",
      snippet: buildGenericMcpJson(),
    },
    {
      id: "codex",
      heading: "Codex（ChatGPT 桌面版或 CLI）",
      requirement: "需要包含 Codex 外掛功能的付費 ChatGPT 方案（Plus 或以上）。Free 與 Go 無法加入外掛或連接器。",
      steps: ["執行下方兩條指令。", "重新啟動 ChatGPT 桌面版，然後開新對話。"],
      snippetLabel: "終端機",
      snippet: buildCodexCommands(),
    },
    {
      id: "chatgpt",
      heading: "ChatGPT",
      requirement:
        "需要付費 ChatGPT 方案（Plus 或以上）。Free 與 Go 不支援自訂連接器與外掛，設定前請先確認你的方案。",
      steps: [
        "開啟 Settings → Connectors，啟用 Developer mode。",
        "選擇 Add，填入下方伺服器網址。",
        "用 UMHelper 帳號登入，並同意唯讀授權。",
      ],
      snippetLabel: "伺服器網址",
      snippet: MCP_PUBLIC_URL,
    },
  ],
  authHeading: "關於登入",
  authParagraphs: [
    "第一次執行工具時，客戶端會開啟 UMHelper 登入頁，接著顯示同意頁並列出要求的權限。",
    "只會要求 umhelper:read 一個權限：讀取公開的課程、教師、評價與班次資料。不會代替你寫入任何內容。",
    "你隨時可以在帳號設定中撤銷授權；撤銷後客戶端只會再次要求你登入。",
  ],
  dataHeading: "傳送與回傳的資料",
  dataBullets: [
    `只回傳公開資料：目錄條目、教師評價摘要、公開主樓評價與班次，且一律附上 ${SITE_URL} 引用連結。`,
    "絕不回傳：電郵地址、評論者身分、隱藏或已刪除的內容、圖片、私人中繼資料、個人課表或管理員備註。",
    "伺服器不會讀取你的個人課表，也不會寫入、投票、回覆、檢舉或匯出任何內容。",
    "本服務由 UMHelper 開發團隊製作的學生專案，並非澳門大學的官方意見或官方資料。",
  ],
  troubleshootHeading: "如果不能用",
  troubleshootBullets: [
    "登入取消或過期：先從客戶端移除伺服器，再重新加入以重新授權。",
    "沒有結果：確認課程碼或教師姓名，必要時先呼叫搜尋工具。",
    "被限流：稍候再試，或把問題縮小。",
    "仍然卡住：見支援頁面的資料流說明與問題回報方式。",
  ],
  supportHref: "/support?lang=zh",
  supportLabel: "外掛支援",
};
