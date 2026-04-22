# PWA Audit — Background

## Purpose

This file holds background context for `pwa-audit-runbook.md`. Read it only if you need
the why behind a check, case-study precedent, or a glossary term. The runbook alone is
sufficient for execution. Nothing here is required to run an audit; it exists so the
runbook itself can stay short and checklist-shaped without losing the reasoning that
justifies each step. Skim the H2 headers, jump to what you need, and go back to the
runbook.

## North Star Principles

- Ship less JavaScript than you think you can get away with.
- Every byte on the critical path costs latency; budget them.
- The user's device and network are worse than yours — measure on median mobile over
  throttled 4G.
- Cache aggressively at every layer; treat invalidation as a correctness problem, not an
  afterthought.
- Perceived performance beats benchmark performance — render something meaningful fast.
- Prefer the platform — browser primitives (`rel=preload`, Speculation Rules, bfcache)
  beat userland reinventions.

These six axioms are the lens the runbook applies. When a runbook check seems pedantic,
it is almost always defending one of these six. When two checks conflict, the one that
better serves the real user on a real device on a real network wins.

A useful exercise before any audit: try to state, out loud, which principle the app
currently violates the most. If you cannot name one, either the app is already in
excellent shape or — far more likely — you have not yet looked at it on a phone. The
gap between lab results on a dev laptop and field data from actual users is consistently
the single largest source of surprise in PWA performance work.

## Case Studies

Hedge all specific numbers. Byte counts and percentage lifts drift over years of
re-quoting; only cite figures that a current link on a vendor/engineering blog supports
at the time you write.

- **Pinterest** — After a focused rewrite of their mobile web experience, Pinterest
  reported a substantial reduction in JavaScript payload on the critical path and a
  meaningful lift in core engagement metrics (signups, ad revenue per session). The
  takeaway is not the specific byte count — which varies by reporting source and has
  drifted over time — but the shape of the win: aggressive code-splitting plus a
  service-worker app shell turned a slow mobile web page into something that competed
  with native in terms of startup feel. The engineering effort was substantial and
  sustained; the lesson is that incremental improvements rarely move business metrics,
  but a deliberate performance initiative does. See https://web.dev/case-studies for a
  current write-up.

- **Uber (m.uber)** — Uber rebuilt their mobile ride-request flow as a web app
  optimized for the cheapest Android phones and weak cellular networks in emerging
  markets. The widely-cited target was an initial payload small enough (on the order of
  a couple hundred kilobytes, gzipped) to load over a very weak connection in a few
  seconds. The engineering discipline that produced it — server-rendered initial HTML,
  a minimal runtime, carefully gated feature code behind route-level splits — is the
  lesson, not any single metric. A useful mental model: imagine the user has exactly
  one chance to load your app before their connection drops, and design for that.

- **Twitter Lite** — One of the earliest prominent PWAs. Twitter reported large
  reductions in data-per-session for users in bandwidth-constrained regions and
  noticeable gains in time-spent and tweets-per-session. It popularized the combination
  of service-worker caching, an app shell, and route-based code splitting as a template
  for content-heavy consumer PWAs. It also demonstrated that installability and
  home-screen presence translate to real engagement lift on mobile — not just a
  vanity metric.

- **NextFaster** — A modern reference implementation built on Next.js that demonstrates
  near-instant navigation by combining aggressive prefetching, Partial Prerendering
  (PPR), React Server Components, and the Speculation Rules API. It is a good read for
  teams on a React/Next stack who want to see how to assemble current-generation
  primitives into a cohesive fast experience. The source code is the documentation.
  Source: https://github.com/ethanniser/NextFaster.

When evaluating a new case study, ask: what did they measure, on what device, on what
network, with what methodology? A 50% improvement in a lab test at the 50th percentile
on a gigabit connection tells you almost nothing about real users. Ask next: what
constraint were they optimizing against? Pinterest cared about ad revenue per session,
Uber cared about conversion on bad networks, Twitter Lite cared about data cost per
user. The shape of the optimization follows the shape of the business constraint. Your
app has its own constraint; the case studies are analogies, not templates.

A further caution: most public case studies describe a one-time rewrite, which is the
least interesting kind of performance work. The harder and more valuable discipline is
defending the gains over years as new features land. Performance budgets enforced in
CI, field metrics surfaced to product reviews, and a named owner for page-weight
regressions are what keep a fast app fast. Case studies rarely describe that ongoing
work, but it is where most teams actually lose ground.

## Reference Implementations

- NextFaster — https://github.com/ethanniser/NextFaster
- Astro examples — https://github.com/withastro/astro/tree/main/examples
- Hotwire demos — https://github.com/hotwired
- web.dev case studies — https://web.dev/case-studies
- Core Web Vitals tooling — https://github.com/GoogleChrome/web-vitals

These repositories are worth cloning and running locally rather than just reading. The
performance properties emerge from how the pieces fit together, not from any single
file, and that is hard to see without a dev-tools profile of the thing actually running.

NextFaster in particular rewards a careful read of its routing and prefetch wiring.
Astro's example set shows the islands model applied across a range of site shapes,
from fully static marketing pages to hybrid content/commerce. Hotwire demonstrates how
much of the classic PWA feel can be achieved with minimal custom JavaScript, by leaning
on server-rendered HTML and a thin turbolinks-style client. The web.dev case studies
tend to be higher-level — useful for framing conversations with non-engineering
stakeholders about why a performance project is worth the time. The `web-vitals`
library is the correct way to collect field metrics; do not roll your own.

## Glossary

One-line definitions, alphabetical. Terms here appear in the runbook without further
explanation; if an unfamiliar acronym shows up, look here first.

- **App Shell** — cached minimal HTML/CSS/JS that renders UI chrome instantly, then
  fetches dynamic content.
- **bfcache (back-forward cache)** — browser-level DOM snapshot enabling instant
  back/forward navigation; killed by `unload` handlers or `Cache-Control: no-store` on
  HTML.
- **CLS (Cumulative Layout Shift)** — visual stability metric; unitless score of
  unexpected layout movement.
- **Compression Dictionaries** — emerging standard letting the browser reuse a prior
  response as a compression dictionary for future ones.
- **Core Web Vitals** — Google's triad of user-experience metrics: LCP, INP, CLS.
- **Early Hints (HTTP 103)** — preliminary response letting the server tell the browser
  to start preloading before the final HTML is ready.
- **FCP (First Contentful Paint)** — time until the first text/image paints.
- **INP (Interaction to Next Paint)** — responsiveness metric replacing FID in 2024.
- **Islands architecture** — mostly-static HTML with isolated interactive components
  ("islands") hydrated independently (Astro pioneered).
- **LCP (Largest Contentful Paint)** — time until the largest visible element paints;
  CWV loading metric.
- **Partial hydration** — hydrating only interactive components rather than the whole
  tree (generalization of islands).
- **RUM (Real User Monitoring)** — collecting performance data from actual users, not
  lab tests.
- **Speculation Rules API** — declarative JSON syntax telling the browser to
  prefetch/prerender specific URLs.
- **Streaming SSR** — server sends HTML in chunks as it's ready, rather than waiting
  for the whole page.
- **SWR (stale-while-revalidate)** — cache strategy serving stale content instantly
  while fetching fresh in background.
- **TBT (Total Blocking Time)** — lab proxy for INP; sum of long-task time past 50ms
  during load.
- **TTFB (Time to First Byte)** — time until the first byte of response arrives.

A note on metric choice: prefer INP over TBT and FID when field data is available, and
prefer LCP over FCP as a loading proxy. The older metrics remain useful as lab signals,
but the runbook's pass/fail thresholds are tuned against the current Core Web Vitals
set. When in doubt, report both the lab number and the field number side by side; a
large gap between them is itself a finding worth investigating.
