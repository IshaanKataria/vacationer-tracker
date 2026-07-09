// Weekly AI research refresh.
// Reads data/programs.json, asks Claude (with server-side web search) to
// verify every entry and hunt for newly opened AU vacationer/internship
// programs in the site's niche, then writes the updated JSON back.
// Zero npm dependencies — uses global fetch (Node 20+).
//
// Env: ANTHROPIC_API_KEY (required), MODEL (optional, default claude-opus-4-8)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "data", "programs.json");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set");
  process.exit(1);
}
const MODEL = process.env.MODEL || "claude-opus-4-8";

const CATEGORIES = ["big4", "bank", "quant", "tech", "consulting"];
const STATUSES = ["open", "rolling", "soon", "closed"];
const WORK_RIGHTS = ["citizen-pr", "visa-friendly", "sponsors-visa", "role-dependent"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const current = readFileSync(DATA_PATH, "utf8");
const today = new Date().toISOString().slice(0, 10);

const prompt = `You maintain the dataset behind a curated tracker of Australian summer vacationer/internship programs (Big 4, banks, quant trading firms, tech, consulting) for penultimate-year university students. Today is ${today}.

Here is the current dataset:

<current-data>
${current}
</current-data>

Your job, using web search against OFFICIAL employer careers pages (cross-check job boards only as a secondary signal):

1. VERIFY every program whose status could plausibly have changed (open/rolling/soon entries, and any closed entry whose next cycle may have opened). Update status, deadline, opens/opensNote and notes to match reality. Set "verified" to ${today} on every entry you actually checked. Leave entries you could not verify untouched (keep their old verified date).
2. If a hard deadline has passed, set the entry's status to "closed".
3. HUNT for newly opened programs that fit the niche (AU summer vacationer/intern programs in finance, consulting, quant trading, or tech, relevant to Melbourne/Sydney students) that are NOT in the dataset, and add them. Follow the existing schema exactly. Use a kebab-case id ending in the cycle year. Only add programs you verified on an official page, with the direct application URL.
4. NEVER invent dates or URLs. If a date is unknown, omit the field and explain in opensNote/notes. Set top-level "lastUpdated" to ${today}.

Rules for fields:
- category: one of ${CATEGORIES.join(", ")}
- status: one of ${STATUSES.join(", ")}
- workRights: one of ${WORK_RIGHTS.join(", ")} (citizen-pr = AU/NZ citizenship or AU PR required; visa-friendly = student-visa holders with working rights eligible; sponsors-visa = firm sponsors relocation/work visa; role-dependent = varies by role)
- deadline/opens/verified: ISO dates (YYYY-MM-DD)
- applyUrl: https URL, as close to the direct application page as possible
- notes: 1-3 tight factual sentences, no marketing fluff

Return the COMPLETE updated JSON document (all programs, existing and new) inside a single <updated-json>...</updated-json> block. No other JSON blocks.`;

async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 32000,
      messages,
      tools: [
        {
          type: "web_search_20260318",
          name: "web_search",
          max_uses: 25,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// Run the conversation, continuing through pause_turn until the model finishes.
let messages = [{ role: "user", content: prompt }];
let response = await callClaude(messages);
let rounds = 0;
while (response.stop_reason === "pause_turn" && rounds < 8) {
  messages = [...messages, { role: "assistant", content: response.content }];
  response = await callClaude(messages);
  rounds++;
}

const text = response.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("\n");

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
