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
let sawPrivate = false;
let cursor = null;
for (;;) {
  const d = await gql(
    `query($login:String!,$c:String){ user(login:$login){
       repositories(first:100,after:$c,ownerAffiliations:OWNER,isFork:false){
         pageInfo{ hasNextPage endCursor }
         nodes{ isArchived isPrivate languages(first:10,orderBy:{field:SIZE,direction:DESC}){
           edges{ size node{ name color } } } } } } }`,
    { login: USER, c: cursor },
  );
  const repos = d.user.repositories;
  for (const r of repos.nodes) {
    if (r.isArchived) continue;
    if (r.isPrivate) sawPrivate = true;
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

// ---- derived series -------------------------------------------------------
const months = [];
{
  const c = new Date();
  c.setUTCDate(1);
  for (let k = 11; k >= 0; k--) {
    const d = new Date(c);
    d.setUTCMonth(d.getUTCMonth() - k);
    const key = d.toISOString().slice(0, 7);
    months.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      count: past.filter((x) => x.date.slice(0, 7) === key)
                 .reduce((s, x) => s + x.contributionCount, 0),
    });
  }
}
const peak = Math.max(1, ...months.map((m) => m.count));
const busiest = months.reduce((a, b) => (b.count > a.count ? b : a), months[0]);

// trailing 365 days: how consistent, not how lucky
const yearAgo = new Date(Date.now() - 364 * 864e5).toISOString().slice(0, 10);
const trailing = past.filter((d) => d.date >= yearAgo);
const activeDays = trailing.filter((d) => d.contributionCount > 0).length;

// yearly totals, for the growth line
const years = [...new Set(past.map((d) => d.date.slice(0, 4)))].sort().slice(-3);
const yearly = years.map((y) => ({
  y,
  n: past.filter((d) => d.date.startsWith(y))
         .reduce((s, d) => s + d.contributionCount, 0),
}));

const THEMES = {
  dark: {
    bg: "#0b0f14", border: "#1f2b38", grid: "#18222d",
    fg: "#e8eef5", muted: "#7d8da0", faint: "#4d5b6b", accent: "#4dd4ac",
  },
  light: {
    bg: "#fbfcfd", border: "#dae2ea", grid: "#e7edf3",
    fg: "#10171e", muted: "#5b6b7c", faint: "#93a2b2", accent: "#0f9d76",
  },
};

const W = 860, H = 300, PAD = 36;
const FONT = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function card(t) {
  const gx = PAD, gy = 100, gw = W - PAD * 2, gh = 126;
  const step = gw / (months.length - 1);
  const pts = months.map((m, i) => [gx + i * step, gy + gh - (m.count / peak) * gh]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${(gx + gw).toFixed(1)},${gy + gh} L${gx},${gy + gh} Z`;
  const grid = [0, 0.5, 1]
    .map((f) => `<line x1="${gx}" y1="${(gy + gh * f).toFixed(1)}" x2="${gx + gw}" y2="${(gy + gh * f).toFixed(1)}" stroke="${t.grid}"/>`)
    .join("");
  const labels = months
    .map((m, i) => i % 2 === 0
      ? `<text x="${(gx + i * step).toFixed(1)}" y="${gy + gh + 16}" text-anchor="middle" font-size="9.5" fill="${t.faint}">${esc(m.label)}</text>`
      : "").join("");
  const last = pts[pts.length - 1];

  const stat = (x, value, label) => `
  <text x="${x}" y="60" font-family="${MONO}" font-size="29" font-weight="600" fill="${t.fg}" letter-spacing="-0.5">${esc(value)}</text>
  <text x="${x}" y="77" font-size="9.5" font-weight="600" fill="${t.muted}" letter-spacing="0.8">${esc(label.toUpperCase())}</text>`;

  // growth line: the part of the story a single total cannot tell
  let gxx = PAD, growth = "";
  yearly.forEach((v, i) => {
    growth += `<text x="${gxx}" y="${H - 20}" font-size="10.5" fill="${t.muted}">${v.y} <tspan font-family="${MONO}" font-weight="600" fill="${i === yearly.length - 1 ? t.accent : t.fg}">${fmt(v.n)}</tspan></text>`;
    gxx += 78;
    if (i < yearly.length - 1) {
      growth += `<text x="${gxx - 16}" y="${H - 20}" font-size="10.5" fill="${t.faint}">→</text>`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" role="img" aria-label="${esc(meta.login)}: ${fmt(total)} contributions, ${activeDays} of 365 days active, longest run ${longest}, peak month ${esc(busiest.label)} at ${busiest.count}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
  <rect x="0.5" y="0.5" width="4" height="${H - 1}" rx="2" fill="${t.accent}"/>

  <text x="${PAD}" y="30" font-size="10.5" font-weight="700" fill="${t.muted}" letter-spacing="1.5">CONTRIBUTION ACTIVITY</text>
  <text x="${W - PAD}" y="30" text-anchor="end" font-size="10" fill="${t.faint}">${esc(nice(today))}</text>

${stat(PAD, fmt(total), "total since " + nice(past.find((d) => d.contributionCount > 0)?.date))}
${stat(PAD + 240, `${activeDays}/365`, "days active, past year")}
${stat(PAD + 450, String(longest), "longest run")}
${stat(PAD + 610, fmt(busiest.count), "peak month, " + busiest.label)}

  ${grid}
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.36"/>
    <stop offset="100%" stop-color="${t.accent}" stop-opacity="0.02"/>
  </linearGradient></defs>
  <path d="${area}" fill="url(#g)"/>
  <path d="${line}" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${t.accent}"/>
  <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7.5" fill="none" stroke="${t.accent}" stroke-opacity="0.28" stroke-width="2"/>
  ${labels}

  <line x1="${PAD}" y1="${H - 40}" x2="${W - PAD}" y2="${H - 40}" stroke="${t.grid}"/>
  ${growth}
  <text x="${W - PAD}" y="${H - 20}" text-anchor="end" font-size="10" fill="${t.faint}">contributions per year</text>
</svg>`;
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/stats.svg", card(THEMES.light));
writeFileSync("dist/stats-dark.svg", card(THEMES.dark));
console.log(
  `ok total=${total} current=${current} longest=${longest} active=${activeDays} langs=${topLangs.map((l) => l[0]).join(",")}`,
);
