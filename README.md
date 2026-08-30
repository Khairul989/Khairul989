# Khairul Azhar

**Senior mobile engineer.** Flutter apps in production, and the backends behind them when that's where the problem actually is.

Kuala Lumpur, Malaysia
[khairul.azhar@keroldev.com](mailto:khairul.azhar@keroldev.com) · [LinkedIn](https://www.linkedin.com/in/muhammad-khairul-azhar-b2b2b81b3/)

---

## What I do

Senior Mobile Engineer at Involve Asia, primary owner of two production Flutter apps on iOS and Android — features, the release train, crash triage, test infrastructure, and the analytics that tell us whether any of it worked.

My scope on paper is mobile. A fair amount of my best work has been backend — Laravel, MySQL, Elasticsearch, Redis — because that's where the defect turned out to live. I'd rather cross a repo boundary than ship a client-side workaround for a server-side bug.

Available for freelance: Flutter, Next.js, Laravel, AdonisJS.

---

## Selected work

**Cut a 400-second production endpoint to 3.3 seconds**
Four correlated `EXISTS` in a `SELECT` list, which MySQL evaluated for every row entering the `ORDER BY` instead of for the 20-row page. Moved classification to run after paging; proved output parity against the original across 210 accounts on the production database.
*The part worth telling:* my first fix benchmarked clean on pages 1 and 5 and took 136 seconds on the last page — 45× worse than the original bug — because the sort order pages into the oldest, highest-volume accounts. Caught before merge. Benchmark the page the sort order makes worst.

**Traced a two-year-old search failure to one Elasticsearch analyzer**
Publishers couldn't find offers through the main search bar. Root cause was a 2024 migration that put an ngram analyzer (`min=max=5`, no lowercase) on the shared offer index — blind to keywords under five characters and to any case mismatch. Silent degradation, no error signal, invisible to monitoring for two years. Fixed with a multi-field split that changed zero queries and preserved the infix matching the deeplink path depended on.

**Found a production outage hiding inside a single-user bug report**
"No data found" for one publisher was actually every publisher: four reference-data IDs pinned from staging, which the production environment numbers differently, so the filter matched 0 of 256,198 rows. Converted the whole surface to resolve by `(type, value)` and fail closed rather than patch the four broken IDs — equality across two environments is insert-order luck, not a property.
*Then worked out why CI never caught it:* the guard test seeded each ID and asserted the ID it had just written, so it could not fail.

**Removed a production crash class instead of a production crash**
Laravel's tagged-cache flush emits a cross-slot multi-key `DEL`, which Redis Cluster rejects — so it only ever failed in production. Shipped a driver-level override that retires the failure for every current and future caller. The design independently converged with the fix the Laravel core team later merged upstream, and ships with a documented plan to delete ours on upgrade.

**Made a list query ~100× cheaper without adding an index**
Reshaped row-multiplying joins into correlated subqueries so it drives on indexes that already existed: 68,579 rows scanned down to 688, temp table and filesort gone. An index would have been faster to write and would have put write-amplification and a DDL lock on a large shared production table. Verified byte-for-byte identical output across twelve filter combinations first.

**Took a mobile codebase from near-zero test coverage to ~99%**
Domain, core, and data layers; ~2,600 tests. Building the test seams surfaced four real bugs, including a dependency-injection annotation that would have crashed app startup on the next code generation. I stopped after the first presentation-layer wave and said so, rather than burn the remaining budget — widget and BLoC coverage was costing several times what the lower layers had.

**Triaged the production crash backlog top-down**
Fifteen-plus crashes root-caused and fixed, each with its own branch and PR, and a live stack trace pulled before any code was written. Four I closed as *not ours* with the evidence to prove it — a vendor SDK's event loop, a device-local Play Services failure — rather than shipping a defensive guard that would have masked nothing.

---

## How I work

The thread running through the work above is that the defect was often in my own fix, and I found it before it shipped. That isn't modesty, it's the method:

- **Stack trace before hypothesis.** A live trace overturns the worklist more often than it confirms it. I don't write a fix from a symptom.
- **Whoever built it doesn't verify it.** A green suite is not evidence. I ask what a check would have to *observe* to catch the defect, then confirm it observes that — a search returning nothing proves nothing until I've seen the pattern match something.
- **Root cause, not masking tape.** If a fix feels hacky it's solving the wrong problem. Twice above, the right answer was to delete an endpoint or refuse a feature rather than optimize it.
- **Say the caveat out loud.** If I couldn't run the suite, that goes in the commit message, the PR body, and the handoff. Work I can't stand behind is worth less than work I can qualify.
- **Boring architecture on purpose.** BLoC for Flutter, clean layering only where the app has earned it. YAGNI beats clever.

---

## Stack

| | |
|---|---|
| **Mobile** | Flutter · Dart · BLoC · Fastlane · Firebase / Crashlytics |
| **Web** | Next.js · TypeScript · React |
| **Backend** | Laravel · NestJS · AdonisJS · Java / Spring Boot |
| **Data & infra** | MySQL · PostgreSQL · Elasticsearch · Redis · SQS · GitHub Actions |

---

<sub>Open to freelance work — email above.</sub>
