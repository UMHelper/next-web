#!/usr/bin/env node
/**
 * Print every "add this MCP server" link and command we publish.
 *
 * Why this exists: the client install formats are not interchangeable — Cursor
 * and LM Studio take base64, VS Code takes URL-encoded JSON with a `type` field,
 * Goose flattens everything into query parameters. Hand-copied base64 blobs rot
 * the moment the endpoint changes, so the links are always *computed* here.
 *
 * Sources of truth (nothing is typed twice):
 *   - mcp/server.json              → registry name + the remote URL
 *   - plugins/what2reg-um/plugin.json → the server id clients should see
 *
 * Usage: npm run mcp:links   (or: node scripts/build-mcp-links.mjs)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const serverJson = JSON.parse(readFileSync(path.join(root, "mcp/server.json"), "utf8"));
const pluginJson = JSON.parse(
  readFileSync(path.join(root, "plugins/what2reg-um/plugin.json"), "utf8"),
);

const SERVER_ID = pluginJson.name;
const REGISTRY_NAME = serverJson.name;
const remote = (serverJson.remotes ?? [])[0] ?? {};
const URL_ = remote.url;

if (!URL_) throw new Error("mcp/server.json has no remotes[0].url");
if (!SERVER_ID) throw new Error("plugins/what2reg-um/plugin.json has no name");

/** UTF-8 safe base64 — mirrors btoa(unescape(encodeURIComponent(s))). */
const base64 = (value) => Buffer.from(value, "utf8").toString("base64");
const cors = () => JSON.stringify({ url: URL_ });
const vsc = () => JSON.stringify({ type: "http", url: URL_ });

const links = {
  "Registry pointer button (preferred, needs a published registry entry)": `https://install.apicommons.org/?name=${encodeURIComponent(REGISTRY_NAME)}`,
  "Cursor (official scheme)": `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_ID}&config=${base64(cors())}`,
  "Cursor (HTTPS form)": `https://cursor.com/en/install-mcp?name=${SERVER_ID}&config=${encodeURIComponent(base64(cors()))}`,
  "VS Code": `https://vscode.dev/redirect/mcp/install?name=${SERVER_ID}&config=${encodeURIComponent(vsc())}`,
  "VS Code Insiders": `https://insiders.vscode.dev/redirect/mcp/install?name=${SERVER_ID}&config=${encodeURIComponent(vsc())}&quality=insiders`,
  "LM Studio": `lmstudio://add_mcp?name=${SERVER_ID}&config=${encodeURIComponent(base64(cors()))}`,
  Goose: `goose://extension?url=${encodeURIComponent(URL_)}&type=streamable_http&id=${SERVER_ID}&name=${encodeURIComponent("What2REG@UM")}&description=${encodeURIComponent("University of Macau course, instructor and review data")}`,
};

const commands = {
  "VS Code CLI": `code --add-mcp '${JSON.stringify({ name: SERVER_ID, type: "http", url: URL_ })}'`,
  "Claude Code": `claude mcp add --transport http ${SERVER_ID} ${URL_}`,
  Codex: [`codex plugin marketplace add UMHelper/next-web`, `codex plugin add ${SERVER_ID}@what2reg-local`].join(
    "\n             ",
  ),
};

console.log(`server id     : ${SERVER_ID}`);
console.log(`registry name : ${REGISTRY_NAME}`);
console.log(`remote url    : ${URL_}`);
console.log("\n—— deep links ——");
for (const [label, href] of Object.entries(links)) console.log(`${label.padEnd(58)} ${href}`);
console.log("\n—— commands ——");
for (const [label, cmd] of Object.entries(commands)) console.log(`${label.padEnd(58)} ${cmd}`);
