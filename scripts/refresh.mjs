// Weekly AI research refresh.
// Reads data/programs.json, asks Claude (with server-side web search) to
// verify every entry and hunt for newly opened AU vacationer/internship
// programs in the site's niche, then writes the updated JSON back.
//
// Uses the Anthropic SDK with streaming: a web-search turn can take many
// minutes before the first byte, which trips the non-streaming HTTP timeout.
// Streaming keeps the connection alive and returns the full message.
//
// Env: ANTHROPIC_API_KEY (required), MODEL (optional, default claude-sonnet-5).
// Sonnet 5 is the default deliberately — it verifies + researches this dataset
// as well as Opus at ~40% lower token cost, which matters on limited credits.
// Set MODEL=claude-opus-4-8 if you ever want maximum quality for a run.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "data", "programs.json");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
const MODEL = process.env.MODEL || "claude-sonnet-5";

// Per-1M-token prices (USD), plus web search at $10 / 1000 searches. Used only
// to print an estimated run cost — the real hard cap is the workspace spend
// limit you set in the Anthropic Console. Standard rates (not intro) so the
// estimate errs high.
const PRICING = {
  "claude-sonnet-5": { in: 3.0, out: 15.0 },
  "claude-opus-4-8": { in: 5.0, out: 25.0 },
};
const WEB_SEARCH_COST = 10 / 1000;
const cost = { in: 0, cacheRead: 0, cacheWrite: 0, out: 0, searches: 0 };

// Always report cost, even if the run exits early on a validation failure.
process.on("exit", () => {
  if (cost.in || cost.cacheRead || cost.out || cost.searches) {
    console.log(
      `Run cost: ~$${estimateCost().toFixed(3)} on ${MODEL} ` +
        `(${cost.in} in, ${cost.cacheRead} cache-read, ${cost.cacheWrite} cache-write, ` +
        `${cost.out} out tokens, ${cost.searches} searches)`
    );
  }
});

const CATEGORIES = ["big4", "bank", "quant", "tech", "consulting"];
const ROLE_TYPES = ["internship", "graduate"];
const STATUSES = ["open", "rolling", "soon", "closed"];
const WORK_RIGHTS = ["citizen-pr", "visa-friendly", "sponsors-visa", "role-dependent"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const current = readFileSync(DATA_PATH, "utf8");
const today = new Date().toISOString().slice(0, 10);

const prompt = `You maintain the dataset behind a curated tracker of Australian early-career programs (Big 4, banks, quant trading firms, tech, consulting) for university students. It covers TWO role types: summer vacationer/internship programs (penultimate-year) AND graduate programs (final-year/recent grads). Today is ${today}.

Here is the current dataset:

<current-data>
${current}
</current-data>

Your job, using web search against OFFICIAL employer careers pages (cross-check job boards only as a secondary signal):

1. VERIFY every program whose status could plausibly have changed (open/rolling/soon entries, and any closed entry whose next cycle may have opened). Update status, deadline, opens/opensNote and notes to match reality. Set "verified" to ${today} on every entry you actually checked. Leave entries you could not verify untouched (keep their old verified date).
2. If a hard deadline has passed, set the entry's status to "closed".
3. HUNT for newly opened programs that fit the niche (AU summer vacationer/intern programs AND graduate programs in finance, consulting, quant trading, or tech, relevant to Melbourne/Sydney students) that are NOT in the dataset, and add them with the correct roleType. Follow the existing schema exactly. Use a kebab-case id ending in the cycle year. Only add programs you verified on an official page, with the direct application URL.
4. NEVER invent dates or URLs. If a date is unknown, omit the field and explain in opensNote/notes. Set top-level "lastUpdated" to ${today}.

Rules for fields:
- roleType: one of ${ROLE_TYPES.join(", ")} (internship = vacationer/summer intern programs; graduate = grad programs, traineeships, entry-level analyst roles)
- category: one of ${CATEGORIES.join(", ")}
- status: one of ${STATUSES.join(", ")}
- workRights: one of ${WORK_RIGHTS.join(", ")} (citizen-pr = AU/NZ citizenship or AU PR required; visa-friendly = student-visa holders with working rights eligible; sponsors-visa = firm sponsors relocation/work visa; role-dependent = varies by role)
- deadline/opens/verified: ISO dates (YYYY-MM-DD)
- applyUrl: https URL, as close to the direct application page as possible
- notes: 1-3 tight factual sentences, no marketing fluff

Return the COMPLETE updated JSON document (all programs, existing and new) inside a single <updated-json>...</updated-json> block. No other JSON blocks.`;

const client = new Anthropic({ apiKey: API_KEY });

async function callClaude(messages, { useTools = true } = {}) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    // Auto-cache the growing prefix: each pause_turn round resends the whole
    // conversation (incl. large web-search results), so without caching those
    // tokens are re-billed at full price every round. Caching reads them at
    // ~0.1x, which is the difference between ~$3.50 and well under $1 per run.
    cache_control: { type: "ephemeral" },
    messages,
    ...(useTools
      ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }] }
      : {}),
  });
  const message = await stream.finalMessage();
  const u = message.usage || {};
  cost.in += u.input_tokens || 0;
  cost.cacheRead += u.cache_read_input_tokens || 0;
  cost.cacheWrite += u.cache_creation_input_tokens || 0;
  cost.out += u.output_tokens || 0;
  cost.searches += u.server_tool_use?.web_search_requests || 0;
  return message;
}

const extractText = (msg) =>
  msg.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

function estimateCost() {
  const p = PRICING[MODEL] || PRICING["claude-sonnet-5"];
  const usd =
    (cost.in / 1e6) * p.in +
    (cost.cacheRead / 1e6) * p.in * 0.1 +
    (cost.cacheWrite / 1e6) * p.in * 1.25 +
    (cost.out / 1e6) * p.out +
    cost.searches * WEB_SEARCH_COST;
  return usd;
}

// Research phase: let the model search, continuing through pause_turn until it
// stops on its own or we hit the round cap.
let messages = [{ role: "user", content: prompt }];
let response = await callClaude(messages);
let rounds = 0;
while (response.stop_reason === "pause_turn" && rounds < 10) {
  messages = [...messages, { role: "assistant", content: response.content }];
  response = await callClaude(messages);
  rounds++;
}

let text = extractText(response);

// The model sometimes keeps deferring ("continue in the next step") and never
// emits the JSON before the round cap. Force one final tool-free synthesis turn
// so it must output the document from what it already verified.
if (!/<updated-json>/.test(text)) {
  messages = [
    ...messages,
    { role: "assistant", content: response.content },
    {
      role: "user",
      content:
        "Stop researching now. Using everything you verified above, output the COMPLETE updated JSON document for ALL programs (existing and any new) inside a single <updated-json>...</updated-json> block. Output nothing else.",
    },
  ];
  response = await callClaude(messages, { useTools: false });
  text = extractText(response);
}

const match = text.match(/<updated-json>([\s\S]*?)<\/updated-json>/);
if (!match) {
  console.error("No <updated-json> block in model output. Output head:\n" + text.slice(0, 2000));
  process.exit(1);
}

let updated;
try {
  updated = JSON.parse(match[1].trim());
} catch (err) {
  console.error("Updated JSON failed to parse: " + err.message);
  process.exit(1);
}

// Schema validation — fail loudly rather than commit a broken dataset.
function fail(msg) {
  console.error("Validation failed: " + msg);
  process.exit(1);
}

if (!ISO_DATE.test(updated.lastUpdated || "")) fail("lastUpdated missing/invalid");
if (!Array.isArray(updated.programs) || updated.programs.length === 0) fail("programs missing/empty");

const prev = JSON.parse(current);
if (updated.programs.length < prev.programs.length - 2) {
  fail(`suspicious shrink: ${prev.programs.length} -> ${updated.programs.length} programs`);
}

const seen = new Set();
for (const p of updated.programs) {
  const where = p.id || p.firm || "unknown entry";
  if (!p.id || seen.has(p.id)) fail(`missing/duplicate id at ${where}`);
  seen.add(p.id);
  if (!p.firm || !p.program || !p.notes) fail(`missing text fields at ${where}`);
  if (!ROLE_TYPES.includes(p.roleType)) fail(`bad roleType at ${where}`);
  if (!CATEGORIES.includes(p.category)) fail(`bad category at ${where}`);
  if (!STATUSES.includes(p.status)) fail(`bad status at ${where}`);
  if (!WORK_RIGHTS.includes(p.workRights)) fail(`bad workRights at ${where}`);
  if (!Array.isArray(p.locations) || p.locations.length === 0) fail(`bad locations at ${where}`);
  if (typeof p.melbourne !== "boolean") fail(`bad melbourne flag at ${where}`);
  if (!/^https:\/\//.test(p.applyUrl || "")) fail(`bad applyUrl at ${where}`);
  if (!ISO_DATE.test(p.verified || "")) fail(`bad verified date at ${where}`);
  for (const field of ["deadline", "opens"]) {
    if (p[field] !== undefined && !ISO_DATE.test(p[field])) fail(`bad ${field} at ${where}`);
  }
}

writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2) + "\n");

const prevIds = new Set(prev.programs.map((p) => p.id));
const added = updated.programs.filter((p) => !prevIds.has(p.id)).map((p) => p.id);
console.log(`OK: ${updated.programs.length} programs (${added.length} new${added.length ? ": " + added.join(", ") : ""})`);
