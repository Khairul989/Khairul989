#!/usr/bin/env node
// Builds SVG stat cards straight from the GitHub API. No third-party service.
// Usage: GITHUB_TOKEN=xxx node scripts/build-cards.mjs

import { writeFileSync, mkdirSync } from "node:fs";

const ENV = process.env;
const USER = ENV.USER_LOGIN || "Khairul989";
const TOKEN = ENV.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN required");
  process.exit(1);
}

const gql = async (query, variables = {}) => {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) {
    throw new Error(
      `GitHub API ${r.status} ${r.statusText}: ${(await r.text()).slice(0, 300)}`,
    );
  }
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  if (!j.data) {
    throw new Error(
      `GitHub API returned no data: ${JSON.stringify(j).slice(0, 300)}`,
    );
  }
  return j.data;
};

// ---- contribution calendar, every year since signup -----------------------
const { user: meta } = await gql(
  `query($login:String!){ user(login:$login){ createdAt login } }`,
  { login: USER },
);

const startYear = new Date(meta.createdAt).getUTCFullYear();
const thisYear = new Date().getUTCFullYear();

const days = [];
for (let y = startYear; y <= thisYear; y++) {
  const d = await gql(
    `query($login:String!,$from:DateTime!,$to:DateTime!){
       user(login:$login){ contributionsCollection(from:$from,to:$to){
         contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`,
    { login: USER, from: `${y}-01-01T00:00:00Z`, to: `${y}-12-31T23:59:59Z` },
  );
  for (const w of d.user.contributionsCollection.contributionCalendar.weeks)
    for (const day of w.contributionDays) days.push(day);
}

days.sort((a, b) => a.date.localeCompare(b.date));
const today = new Date().toISOString().slice(0, 10);
const past = days.filter((d) => d.date <= today);
const total = past.reduce((s, d) => s + d.contributionCount, 0);

// longest streak
let longest = 0, run = 0, runStart = null, longestStart = null, longestEnd = null;
for (const d of past) {
  if (d.contributionCount > 0) {
    if (run === 0) runStart = d.date;
    run++;
    if (run > longest) {
      longest = run;
      longestStart = runStart;
      longestEnd = d.date;
    }
  } else run = 0;
}

// current streak — today is allowed to be empty without breaking it
let current = 0, currentStart = null, currentEnd = null;
for (let i = past.length - 1; i >= 0; i--) {
  const d = past[i];
  if (d.contributionCount > 0) {
    if (current === 0) currentEnd = d.date;
    current++;
    currentStart = d.date;
  } else if (i === past.length - 1) {
    continue;
  } else break;
}

// ---- languages by bytes, own non-fork repos -------------------------------
const langs = {};
let cursor = null;
for (;;) {
  const d = await gql(
    `query($login:String!,$c:String){ user(login:$login){
       repositories(first:100,after:$c,ownerAffiliations:OWNER,isFork:false){
         pageInfo{ hasNextPage endCursor }
         nodes{ isArchived languages(first:10,orderBy:{field:SIZE,direction:DESC}){
           edges{ size node{ name color } } } } } } }`,
    { login: USER, c: cursor },
  );
  const repos = d.user.repositories;
  for (const r of repos.nodes) {
    if (r.isArchived) continue;
    for (const e of r.languages.edges) {
      langs[e.node.name] ??= { size: 0, color: e.node.color || "#8b949e" };
      langs[e.node.name].size += e.size;
    }
  }
  if (!repos.pageInfo.hasNextPage) break;
  cursor = repos.pageInfo.endCursor;
}
const topLangs = Object.entries(langs)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 6);
const langTotal = topLangs.reduce((s, [, v]) => s + v.size, 0) || 1;

// ---- render ---------------------------------------------------------------
const fmt = (n) => n.toLocaleString("en-US");
const nice = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
      })
    : "—";
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const THEMES = {
  dark: { bg: "#0d1117", border: "#30363d", fg: "#e6edf3", muted: "#8b949e", accent: "#58a6ff", track: "#21262d" },
  light: { bg: "#ffffff", border: "#d1d9e0", fg: "#1f2328", muted: "#59636e", accent: "#0969da", track: "#eaeef2" },
};

const W = 820, H = 208, PAD = 44;
const FONT = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function card(t) {
  const stat = (x, value, label, sub) => `
  <text x="${x}" y="80" text-anchor="middle" font-family="${MONO}" font-size="34" font-weight="700" fill="${t.accent}">${esc(value)}</text>
  <text x="${x}" y="103" text-anchor="middle" font-size="12.5" font-weight="600" fill="${t.fg}">${esc(label)}</text>
  <text x="${x}" y="120" text-anchor="middle" font-size="10.5" fill="${t.muted}">${esc(sub)}</text>`;

  const BAR_W = W - PAD * 2;
  let bx = PAD, bars = "", legend = "", lx = PAD;
  for (const [name, v] of topLangs) {
    const w = Math.max(3, (v.size / langTotal) * BAR_W - 2);
    bars += `<rect x="${bx.toFixed(1)}" y="152" width="${w.toFixed(1)}" height="9" rx="4.5" fill="${esc(v.color)}"/>`;
    bx += w + 2;
    const pct = ((v.size / langTotal) * 100).toFixed(1);
    legend += `<circle cx="${(lx + 4).toFixed(1)}" cy="182" r="4.5" fill="${esc(v.color)}"/><text x="${(lx + 14).toFixed(1)}" y="186" font-size="11" fill="${t.muted}">${esc(name)} ${pct}%</text>`;
    lx += 20 + (name.length * 6.3) + 36;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="${esc(meta.login)}: ${fmt(total)} contributions, current streak ${current} days, longest streak ${longest} days">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
  <text x="${PAD}" y="38" font-size="13" font-weight="600" fill="${t.fg}">${esc(meta.login)}</text>
  <text x="${W - PAD}" y="38" text-anchor="end" font-size="11" fill="${t.muted}">updated ${esc(nice(today))}</text>
  <line x1="${PAD}" y1="52" x2="${W - PAD}" y2="52" stroke="${t.border}"/>
${stat(W * 0.2, fmt(total), "Total contributions", `since ${nice(past.find((d) => d.contributionCount > 0)?.date)}`)}
${stat(W * 0.5, String(current), "Current streak", current ? `${nice(currentStart)} – ${nice(currentEnd)}` : "no active streak")}
${stat(W * 0.8, String(longest), "Longest streak", `${nice(longestStart)} – ${nice(longestEnd)}`)}
  <text x="${PAD}" y="142" font-size="11" font-weight="600" fill="${t.fg}">Languages by bytes, own repos</text>
  <rect x="${PAD}" y="152" width="${BAR_W}" height="9" rx="4.5" fill="${t.track}"/>
${bars}${legend}
</svg>`;
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/stats.svg", card(THEMES.light));
writeFileSync("dist/stats-dark.svg", card(THEMES.dark));
console.log(
  `ok total=${total} current=${current} longest=${longest} langs=${topLangs.map((l) => l[0]).join(",")}`,
);
