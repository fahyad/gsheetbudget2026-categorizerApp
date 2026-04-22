# PWA Audit — Runbook

Operational checklist for auditing a PWA. Execute top-to-bottom. Background context lives in `pwa-audit-background.md` — only read it if you need the why.

## 1. Output Schema

Every check emits a JSON finding matching this shape:

```json
{
  "id": "JS-03",
  "category": "javascript-budget",
  "severity": "critical | high | medium | low | info",
  "status": "fail | pass | partial | not-applicable | blocked",
  "evidence": "path/to/file.js:42  |  curl -I header snippet  |  measured value",
  "recommendation": "concrete fix, one or two sentences",
  "effort": "trivial | small | medium | large"
}
```

The overall audit report has this wrapper:

- **Executive summary** — 3 to 5 bullets. Highest-severity findings and the single biggest win.
- **Findings** — grouped by severity, critical first.
- **Measurement baseline** — commit SHA, URL audited, Lighthouse version, date, network throttle used, device emulated.
- **Triage summary** — top 5 quick wins ordered by `effort` ascending then `severity` descending.

## 2. Severity Definitions

Apply these thresholds literally. If a finding fits two levels, use the higher one.

- **Critical** — any Core Web Vital in the "poor" range; initial JS payload > 500 KB gzipped; missing service worker on a site that declares itself a PWA via `manifest.json`; synchronous third-party script in `<head>`; `document.write` anywhere; no HTTPS.
- **High** — any Core Web Vital in "needs improvement"; initial JS 250–500 KB gzipped; images without width/height or aspect-ratio causing measurable CLS; blocking font load > 1 s; no CDN on static assets.
- **Medium** — known-heavy dependencies imported whole (`moment`, full `lodash`, full `rxjs`, full Material-UI); missing `fetchpriority="high"` on the LCP element; non-critical data waterfalls; missing prefetch on hover/touchstart.
- **Low** — missing `decoding="async"`; manifest polish (short_name, maskable icons, categories); `dns-prefetch` not used for non-critical cross-origin hosts.
- **Info** — opportunities, not defects. e.g. "Switching React to Preact would save ~30 KB on this public marketing page."

`[ADVISE]` checks emit `info` by default and never `critical` or `high`.

## 3. Execution Rules

- **Evidence is mandatory.** Every `fail` or `partial` finding must cite a concrete artifact: a `file:line`, a command's stdout, an HTTP header, or a measured number. Findings without evidence are downgraded to `info` or dropped.
- **One finding per check ID.** No double-reporting. When concerns overlap (e.g. images causing CLS), file under the more specific ID and cross-reference from the other.
- **Blocked handling:**
  - Site behind auth → status `blocked`, skip network checks, continue with static checks.
  - No build command documented → grep `package.json` scripts, attempt `npm run build` / `pnpm build` / `yarn build`, else emit a `blocked` finding and continue.
  - Lighthouse fails → retry up to 3 times with different flags (`--preset=desktop`, `--throttling-method=provided`, `--chrome-flags="--no-sandbox"`), then emit a `blocked` finding with the error text.
  - Repo not in git → warn the user and continue with filesystem-only checks.
- **Tight-context triage order.** If you cannot run every section, run Step 0 + `JS`, `REN`, `CAC`, `IMG`, `CWV` first. Everything else is secondary.

## 4. Step 0 — Framework Detection

Gating check. Run this before any `FWK` sub-block.

### FW-00 — Detect the rendering framework
**Type:** [DETECT]
**Run:** `cat package.json 2>/dev/null; ls -1 . | head -40; test -f Gemfile && cat Gemfile`
**Parse:** dependency names and root-level files.
**Emit finding if:** always emit. This is the routing finding for all `FWK` sub-blocks.
**Evidence:** matched dependency or file.
**Fix:** none — this is an informational finding.

Mapping:
- `next` in deps → **Next.js**
- `react` in deps, no `next`/`remix`/`gatsby` → **CSR React**
- `astro` in deps → **Astro**
- `Gemfile` containing `turbo-rails` or `hotwired` → **Hotwire**
- `nuxt` → **Nuxt**; `vue` alone → **Vue CSR**
- `@sveltejs/kit` → **SvelteKit**; `svelte` alone → **Svelte CSR**
- `remix` or `@remix-run/*` → **Remix**
- Plain `index.html` at root, no `package.json` build script → **vanilla PWA**

Only the matching `FWK` sub-block runs. Skip others as `not-applicable`.

## 5. Checks

Each check follows this shape:

```
### <ID> — <short title>
**Type:** [DETECT] or [ADVISE]
**Run:** <exact command or grep>
**Parse:** <what to look at>
**Emit finding if:** <decision rule with numeric threshold>
**Evidence:** <artifact to capture>
**Fix:** <1–2 line recommendation>
```

## JS — JavaScript Budget & Delivery

### JS-01 — Initial JS payload size
**Type:** [DETECT]
**Run:** `npm run build 2>&1 | tail -50` then inspect `dist/` or `.next/` or `build/` for hashed JS. If a CDN URL is known: `curl -sI -H 'Accept-Encoding: gzip, br' <main-bundle-url> | grep -iE 'content-length|content-encoding'`.
**Parse:** sum of gzipped bytes for JS loaded on the first paint (not including dynamically-imported chunks).
**Emit finding if:** > 500 KB gzipped → `critical`; 250–500 KB → `high`; 150–250 KB → `medium`; < 150 KB → `pass`.
**Evidence:** bundle filename, gzipped size, sum.
**Fix:** run `npx source-map-explorer <bundle>` and attack the largest contributors: dynamic-import route-level chunks, tree-shake, replace heavy deps.

### JS-02 — Heavy library whole-imports
**Type:** [DETECT]
**Run:** `grep -rnE "from ['\"](moment|lodash|rxjs|@material-ui/core|@mui/material|pdfkit|chart\.js)['\"]" src/ app/ pages/ components/ 2>/dev/null`
**Parse:** imports of whole packages instead of specific submodules.
**Emit finding if:** any match for `moment` (entire package is ~70 KB gzipped) → `medium`. `lodash` whole-import → `medium`. Full MUI/RxJS without tree-shaking config → `medium`.
**Evidence:** file:line of each whole-import.
**Fix:** `moment` → `date-fns` or `dayjs`; `lodash` → `lodash-es` with deep imports `import debounce from 'lodash-es/debounce'`; MUI → verify `sideEffects: false` and ES module imports; RxJS → `import { map } from 'rxjs/operators'`.

### JS-03 — Dynamic imports on route boundaries
**Type:** [DETECT]
**Run:** `grep -rnE "(React\.lazy|import\()" src/ app/ pages/ routes/ 2>/dev/null | wc -l` and separately `grep -rnE "^import .* from ['\"]\./(pages|routes|views)/" src/ 2>/dev/null | wc -l`
**Parse:** ratio of statically-imported route components to lazily-loaded ones.
**Emit finding if:** more than 3 route/page components statically imported into the entry → `high`. Zero dynamic imports in a non-trivial app → `high`.
**Evidence:** count and file:line examples.
**Fix:** convert route components to `React.lazy(() => import('./Route'))` or framework equivalent (`next/dynamic`, `defineAsyncComponent`). Wrap in `<Suspense>`.

### JS-04 — First-party vs third-party JS split
**Type:** [DETECT]
**Run:** `grep -oE '<script[^>]*src=["\47][^"\47]+' index.html public/index.html dist/index.html 2>/dev/null | sed -E 's/.*src=["\47]//' | awk -F/ '{print $3}' | sort -u`
**Parse:** list of distinct origins serving scripts.
**Emit finding if:** third-party JS > 30% of total payload → `high`. Synchronous third-party script in `<head>` (no `async`/`defer`) → `critical`.
**Evidence:** origin list and byte sizes.
**Fix:** move all non-critical 3P to `async` or `defer`. Self-host critical 3P (analytics beacon, A/B flags) via proxy if business-critical.

### JS-05 — Tree-shaking enabled
**Type:** [DETECT]
**Run:** `grep -E '"sideEffects"' package.json; grep -E 'mode|optimization' webpack.config.* vite.config.* rollup.config.* 2>/dev/null`
**Parse:** `"sideEffects": false` in `package.json` for libraries; production mode in bundler config.
**Emit finding if:** production build not using `mode: 'production'` / `NODE_ENV=production` → `critical`. First-party package publishes with no `sideEffects` declaration → `medium`.
**Evidence:** config file:line.
**Fix:** set `"sideEffects": false` in `package.json` (or enumerate CSS/polyfill side-effect files). Ensure prod build runs with `NODE_ENV=production`.

## REN — Rendering Strategy

### REN-01 — SSR vs CSR detection
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -cE '<div id="(root|app|__next)">[[:space:]]*</div>'` — empty root div means CSR. Cross-check against framework from FW-00.
**Parse:** whether meaningful markup is present in the initial HTML response.
**Emit finding if:** empty root container on a public content page → `high`. CSR is a choice, not always a bug, but for SEO/content-heavy pages it harms LCP.
**Evidence:** first 2 KB of initial HTML.
**Fix:** migrate to SSR/SSG via the framework's supported path (Next.js App Router, Astro, SvelteKit default, Nuxt `ssr: true`), or pre-render static routes.

### REN-02 — Streaming SSR vs plain SSR
**Type:** [DETECT]
**Run:** `grep -rnE "renderToPipeableStream|renderToReadableStream|<Suspense" src/ app/ 2>/dev/null` for React; check for `experimental.streaming` or PPR flags in `next.config.*`.
**Parse:** whether the server streams HTML or buffers to string.
**Emit finding if:** SSR app using `renderToString` with no streaming primitives, and TTFB > 400 ms → `medium`. No `<Suspense>` boundaries around slow data → `medium`.
**Evidence:** rendering API call and file:line, TTFB measurement.
**Fix:** switch to `renderToPipeableStream` (Node) / `renderToReadableStream` (edge). Wrap slow data fetches in `<Suspense>` with lightweight fallbacks so the shell streams early.

### REN-03 — Hydration waterfalls
**Type:** [DETECT]
**Run:** Run Lighthouse (see CWV-01) and inspect the trace for long tasks clustered after HTML parse; also `grep -rn "useEffect.*fetch\|useEffect.*axios" src/ | wc -l`.
**Parse:** count of client-side `useEffect`-triggered fetches on top-level pages.
**Emit finding if:** more than one sequential `useEffect` fetch on a landing page (each requires hydration before firing) → `high`.
**Evidence:** file:line of the offending components.
**Fix:** move data fetching server-side (Server Components, loaders, `getServerSideProps`). If client-side is required, parallelize with `Promise.all` or push to a single loader.

### REN-04 — Partial hydration / islands architecture
**Type:** [ADVISE]
**Run:** detect from FW-00. For Astro: `grep -rnE 'client:(load|idle|visible|media|only)' src/ 2>/dev/null`. For Qwik: presence of `@builder.io/qwik` in deps. For React: presence of `next/dynamic` with `ssr: false`.
**Parse:** whether interactive components hydrate independently vs. whole-page hydration.
**Emit finding if:** mostly-static content site shipping a full React/Vue bundle and hydrating the whole tree → `info` recommending islands.
**Evidence:** HTML size vs. JS size ratio; framework.
**Fix:** consider migrating to Astro for content-heavy, low-interactivity pages. On Next.js App Router, mark only interactive leaves as `"use client"`.

### REN-05 — Critical CSS inlined
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -cE '<style[^>]*>'` and `curl -s <url> | grep -cE '<link[^>]+rel=["\47]stylesheet'`
**Parse:** whether above-the-fold CSS is inlined in `<head>` or blocked on external CSS.
**Emit finding if:** zero inline `<style>` AND blocking external stylesheet > 30 KB → `high`. Framework should be doing this automatically; if it isn't, a build config issue exists.
**Evidence:** stylesheet URL and size; presence/absence of inline style.
**Fix:** enable the framework's critical CSS extraction (`next/font` + CSS modules get this for free; Astro does it by default; for custom Webpack, use `critters` or `beasties`).

## CAC — Caching

### CAC-01 — Static asset Cache-Control
**Type:** [DETECT]
**Run:** `curl -sI <hashed-asset-url> | grep -iE 'cache-control|etag|expires'`
**Parse:** `Cache-Control` directive on hashed/fingerprinted assets.
**Emit finding if:** hashed asset missing `immutable` or max-age < 1 year → `medium`. No `Cache-Control` header at all → `high`.
**Evidence:** header dump.
**Fix:** set `Cache-Control: public, max-age=31536000, immutable` for hashed assets. For HTML, use `Cache-Control: no-cache` (revalidate) — not `no-store`, which kills bfcache.

### CAC-02 — HTML caching posture
**Type:** [DETECT]
**Run:** `curl -sI <page-url> | grep -iE 'cache-control|etag|age|x-cache'`
**Parse:** `Cache-Control` on HTML and any CDN cache hit indicators.
**Emit finding if:** HTML has `Cache-Control: no-store` (kills bfcache, see PRF-01) → `high`. HTML has no `ETag` and no `Cache-Control` → `medium`.
**Evidence:** header dump.
**Fix:** use `Cache-Control: no-cache, must-revalidate` + `ETag` for dynamic HTML so the browser revalidates cheaply. Reserve `no-store` for responses with PII that must not be stored.

### CAC-03 — Service worker caching strategy
**Type:** [DETECT]
**Run:** `test -f sw.js && cat sw.js | grep -cE 'caches\.(open|match|put)|cache\.put|cache\.match'; grep -cE 'workbox' package.json 2>/dev/null`
**Parse:** presence and shape of caching logic in the SW.
**Emit finding if:** SW registered but no `caches.*` calls (no-op SW) → `high`. SW uses cache-only for dynamic API responses → `medium`. No cache-cleanup in `activate` (see SW-02) → `medium`.
**Evidence:** `sw.js:line` of caching logic.
**Fix:** adopt a stale-while-revalidate strategy for API GETs (serve cache, revalidate in background). Cache-first for hashed assets. Network-first with timeout for HTML.

### CAC-04 — App shell pattern
**Type:** [ADVISE]
**Run:** `grep -nE "(precache|APP_SHELL|shell\.html)" sw.js workbox-config.* 2>/dev/null`
**Parse:** whether a minimal HTML shell is precached for instant UI on repeat visits.
**Emit finding if:** no precache manifest AND site is a true SPA → `info`.
**Evidence:** SW precache list or its absence.
**Fix:** precache the app shell (minimal HTML, CSS, JS for chrome) on SW install. Workbox `precacheAndRoute(self.__WB_MANIFEST)` is the standard path.

### CAC-05 — CDN in front of origin
**Type:** [DETECT]
**Run:** `curl -sI <asset-url> | grep -iE 'via|x-served-by|x-cache|cf-ray|x-amz-cf-id|fly-request-id|server'`
**Parse:** headers that reveal CDN presence (Cloudflare, Fastly, CloudFront, Vercel, Fly, Netlify).
**Emit finding if:** static assets served directly from origin (no CDN markers) → `high`.
**Evidence:** header dump.
**Fix:** put a CDN in front of static assets. For PWAs, Cloudflare / Vercel / Netlify / Fastly are common; the goal is edge caching + geographic proximity.

## PRE — Prefetching & Preloading

### PRE-01 — `rel=preconnect` to critical cross-origin hosts
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<link[^>]+rel=["\47]preconnect[^>]+>'`
**Parse:** list of preconnected origins.
**Emit finding if:** any cross-origin request on the critical path (font host, API host, image CDN) is not preconnected → `medium`.
**Evidence:** missing origin.
**Fix:** add `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` (the `crossorigin` attribute is required for fonts). For non-critical origins use `dns-prefetch` instead.

### PRE-02 — LCP element `fetchpriority="high"`
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<(img|link)[^>]+(fetchpriority|rel=["\47]preload)[^>]*>'` — then separately identify the LCP image via Lighthouse.
**Parse:** whether the LCP image/resource is marked as high priority.
**Emit finding if:** LCP image lacks `fetchpriority="high"` → `medium`. LCP hero image loaded as `lazy` → `high`.
**Evidence:** the LCP element's HTML.
**Fix:** add `fetchpriority="high"` to the `<img>` and ensure `loading="eager"` (or omit, as eager is default). Keep lazy only for below-the-fold images.

### PRE-03 — Disambiguating preload / modulepreload / fetchpriority
**Type:** [ADVISE]
**Run:** `curl -s <url> | grep -oE '<link[^>]+rel=["\47](preload|modulepreload)[^>]*>'`
**Parse:** what is being preloaded and with what `as`/priority.
**Emit finding if:** `<link rel=preload as=script>` used for ES modules (should be `modulepreload`) → `low`. `rel=preload` used for resources already at high priority (wastes connection) → `low`. `fetchpriority` used on non-critical resources → `low`.
**Evidence:** file:line or HTML snippet.
**Fix:** guidelines:
- `rel=preload` — general-purpose early hint for any resource not discoverable by the preload scanner (fonts referenced only in CSS, hero images referenced in JS).
- `rel=modulepreload` — ES modules specifically; preloads AND parses AND resolves the dependency graph.
- `fetchpriority="high"` — raise the priority of a resource already discovered, most useful on the LCP `<img>`. Not a substitute for preload; does not pre-fetch.

### PRE-04 — Speculation Rules API
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<script[^>]*type=["\47]speculationrules["\47][^>]*>[^<]*</script>'`
**Parse:** presence and shape of a speculation rules block. Typical syntax:
```html
<script type="speculationrules">
{"prerender":[{"where":{"href_matches":"/*"},"eagerness":"moderate"}]}
</script>
```
**Emit finding if:** content-rich site with obvious next-page navigation patterns and no speculation rules → `info`.
**Evidence:** presence or absence of the block.
**Fix:** add a conservative `prerender` rule (`"eagerness":"moderate"` or rely on `prefetch` with hover triggers). Test in Chrome DevTools Application → Speculative loads.

### PRE-05 — Hover/touchstart prefetch
**Type:** [DETECT]
**Run:** `grep -rnE "onMouseEnter|onMouseOver|onTouchStart|pointerover" src/ app/ 2>/dev/null | grep -iE 'prefetch|preload'; grep -rnE "quicklink|instant\.page" package.json src/ 2>/dev/null`
**Parse:** whether internal links prefetch on intent.
**Emit finding if:** SPA or MPA with internal navigation and no prefetch-on-hover library or handler → `medium`.
**Evidence:** framework default (Next.js `<Link>` prefetches in viewport by default; document if disabled) or absence.
**Fix:** use framework primitives (`next/link`, `remix` link prefetch, SvelteKit `data-sveltekit-preload-data`), or drop in `instant.page` / `quicklink` for plain sites.

### PRE-06 — 103 Early Hints
**Type:** [DETECT]
**Run:** `curl -sI --http2 <url> 2>&1 | grep -E '^HTTP/(2|3)'` — look for a `103` preliminary response before the final `200`. On servers that support it, `curl -v` shows both.
**Parse:** presence of HTTP 103 with `Link: </asset>; rel=preload` headers.
**Emit finding if:** origin supports 103 Early Hints (Cloudflare, Fastly, Node with `res.writeEarlyHints`) but none are sent → `info`.
**Evidence:** `curl -v` output.
**Fix:** send 103 Early Hints with `Link: rel=preload` for the LCP resource and critical CSS. Most impactful when TTFB for the final response is > 200 ms (gives the browser something to do during that wait).

## IMG — Images

### IMG-01 — Dimensions and aspect-ratio
**Type:** [DETECT]
**Run:** `grep -rnE '<img[^>]*>' src/ app/ components/ public/ 2>/dev/null | grep -vE 'width=|aspect-ratio' | head -30`
**Parse:** `<img>` tags missing `width`+`height` attributes AND no `aspect-ratio` CSS.
**Emit finding if:** any above-the-fold image missing dimensions → `high` (directly causes CLS). Below-the-fold images missing dimensions → `medium`.
**Evidence:** file:line of each offender.
**Fix:** always set `width` and `height` attributes (browser computes aspect-ratio). For responsive images, pair with `style="height: auto"` or CSS `aspect-ratio`. This is the single highest-ROI CLS fix.

### IMG-02 — Modern formats (AVIF/WebP) with fallback
**Type:** [DETECT]
**Run:** `find public/ assets/ static/ src/assets/ -type f \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' \) 2>/dev/null | head -20; grep -rnE '<picture>|\.(avif|webp)' src/ app/ components/ 2>/dev/null | head`
**Parse:** whether raster images are served in modern formats with graceful fallback.
**Emit finding if:** images-heavy site with no AVIF/WebP and no image CDN → `high`.
**Evidence:** file list and total bytes of raw JPEG/PNG.
**Fix:** either (a) use `<picture>` with `<source type="image/avif">`, `<source type="image/webp">`, and a JPEG fallback `<img>`; or (b) use an image CDN (`next/image`, Cloudinary, imgix, Cloudflare Images) that negotiates via `Accept`.

### IMG-03 — Responsive `srcset` and `sizes`
**Type:** [DETECT]
**Run:** `grep -rnE '<img[^>]+(srcset|sizes)=' src/ app/ 2>/dev/null | wc -l; grep -rnE '<img[^>]*src=' src/ app/ 2>/dev/null | wc -l`
**Parse:** ratio of images using `srcset` to total `<img>` count.
**Emit finding if:** hero and gallery images lack `srcset` → `medium`. No `sizes` attribute with `srcset` → `medium` (browser guesses).
**Evidence:** file:line of offenders.
**Fix:** provide `srcset="img-400.jpg 400w, img-800.jpg 800w, img-1200.jpg 1200w"` with `sizes="(max-width: 600px) 100vw, 50vw"`. Framework image components do this automatically.

### IMG-04 — Lazy vs eager loading
**Type:** [DETECT]
**Run:** `grep -rnE '<img[^>]+loading=["\47](lazy|eager)' src/ app/ 2>/dev/null`
**Parse:** which images are lazy and which are eager.
**Emit finding if:** LCP image is `loading="lazy"` → `high`. All images `loading="eager"` (defeats lazy loading) → `medium`.
**Evidence:** file:line of LCP image.
**Fix:** LCP image: `loading="eager"` + `fetchpriority="high"`. Everything below the fold: `loading="lazy"` + `decoding="async"`.

### IMG-05 — `decoding="async"`
**Type:** [DETECT]
**Run:** `grep -rcE '<img[^>]+decoding=["\47]async' src/ app/ 2>/dev/null`
**Parse:** count of images with async decoding.
**Emit finding if:** more than ~10 images and none use `decoding="async"` → `low`.
**Evidence:** count.
**Fix:** add `decoding="async"` to non-LCP images. Harmless, tiny win on main-thread work.

## FNT — Fonts

### FNT-01 — Self-hosted vs third-party font host
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<link[^>]+href=["\47]https?://[^"\47]*(fonts\.googleapis|fonts\.gstatic|use\.typekit|typekit\.net)[^"\47]*'`
**Parse:** whether fonts are loaded from third-party CDN.
**Emit finding if:** Google Fonts CSS loaded via `fonts.googleapis.com` on the critical path → `medium` (extra DNS + TLS, no sharing benefit since cache partitioning).
**Evidence:** link tag.
**Fix:** self-host fonts (download the subsetted WOFF2, serve from your own CDN). Tools: `fontsource`, `next/font` does this automatically, `@fontsource/*` npm packages.

### FNT-02 — `font-display` policy
**Type:** [DETECT]
**Run:** `grep -rnE 'font-display' src/ app/ public/ css/ 2>/dev/null; curl -s <url> | grep -oE 'font-display:[^;]+'`
**Parse:** `font-display` values in `@font-face` declarations.
**Emit finding if:** missing `font-display` (defaults to `auto`, which browsers treat as `block` — blank text up to 3 s) → `high`.
**Evidence:** `@font-face` block.
**Fix:** use `font-display: swap` for body text (shows fallback immediately, swaps when ready) or `optional` (uses fallback if font isn't cached within 100 ms — best for CLS).

### FNT-03 — Preload critical fonts
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<link[^>]+rel=["\47]preload[^>]+as=["\47]font'`
**Parse:** preloaded fonts.
**Emit finding if:** self-hosted font on the critical path with no preload → `medium`.
**Evidence:** presence or absence.
**Fix:** add `<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>`. The `crossorigin` attribute is required even for same-origin fonts.

### FNT-04 — Font subsetting
**Type:** [DETECT]
**Run:** `ls -la public/fonts/ assets/fonts/ src/assets/fonts/ 2>/dev/null`
**Parse:** size of WOFF2 files.
**Emit finding if:** any single font file > 100 KB (likely not subsetted) → `medium`.
**Evidence:** file size.
**Fix:** subset with `glyphhanger` or `pyftsubset` to the Unicode ranges actually used. Split by language with `unicode-range` in `@font-face` so only needed subsets download.

### FNT-05 — `size-adjust` / `ascent-override` for CLS
**Type:** [ADVISE]
**Run:** `grep -rnE 'size-adjust|ascent-override|descent-override' src/ app/ public/ css/ 2>/dev/null`
**Parse:** whether a fallback-matched `@font-face` is declared for the system font.
**Emit finding if:** custom font used with `font-display: swap` and no size-matched fallback → `info` (CLS when swap fires).
**Evidence:** `@font-face` block.
**Fix:** generate a size-matched local fallback with the Fontaine tool or `npx fontaine`. `next/font` does this automatically.

## 3P — Third-Party Scripts

### 3P-01 — Enumerate third-party origins
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<script[^>]+src=["\47]https?://[^"\47]+' | sed -E 's/.*src=["\47]//' | awk -F/ '{print $3}' | sort -u`
**Parse:** list of distinct third-party origins.
**Emit finding if:** > 5 third-party origins on a page → `medium`. Any synchronous 3P in `<head>` → `critical`.
**Evidence:** origin list.
**Fix:** remove or consolidate. Tag managers are typically the worst offender — audit what's actually firing and drop the rest.

### 3P-02 — `async` / `defer` on non-critical 3P
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<script[^>]*src=["\47]https?://[^"\47]+["\47][^>]*>' | grep -vE 'async|defer'`
**Parse:** 3P scripts without `async` or `defer`.
**Emit finding if:** any 3P script is render-blocking (no `async`/`defer`, in `<head>`) and not truly critical → `high`.
**Evidence:** script tag.
**Fix:** add `defer` for scripts that need DOM but can wait until parse completes; `async` for scripts that are independent of order (analytics beacons). Move to end of `<body>` as a last resort.

### 3P-03 — Chat widget presence and origin
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oiE '(intercom|drift|zendesk|crisp|hubspot-messages|tawk|livechat|freshchat)'`
**Parse:** presence + origin. A static audit cannot measure the actual transferred size without a live network trace — record presence and flag for manual measurement in DevTools.
**Emit finding if:** any chat widget detected → `medium` with a note: "verify transferred size and main-thread time in DevTools Network + Performance".
**Evidence:** widget name + loader script URL.
**Fix:** lazy-load the widget on user intent (click a "Chat with us" button that injects the script). Never load chat on every page if only used on ~1% of sessions.

### 3P-04 — Analytics / tag manager
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oiE '(googletagmanager|google-analytics|gtag|segment|amplitude|mixpanel|heap|fullstory|hotjar|clarity)'`
**Parse:** analytics stack in use.
**Emit finding if:** both GTM AND a direct tag (GA4, Segment) loaded → `medium` (pick one). Session replay tools (FullStory, Hotjar) present and > 100 KB gzipped → `medium`.
**Evidence:** script references.
**Fix:** consolidate. Session replay is expensive — sample aggressively (1–5% of sessions) or use server-side tagging.

## SW — Service Worker & Offline

### SW-01 — SW registration and scope
**Type:** [DETECT]
**Run:** `grep -rnE 'navigator\.serviceWorker\.register' src/ app/ js/ public/ 2>/dev/null; test -f sw.js && head -20 sw.js`
**Parse:** registration call and scope.
**Emit finding if:** site has `manifest.json` but no SW registration → `critical` (not a PWA). SW scope narrower than intended (registered from `/js/sw.js` without `scope: '/'`) → `high`.
**Evidence:** registration call file:line.
**Fix:** register with explicit scope: `navigator.serviceWorker.register('/sw.js', { scope: '/' })`. Serve `sw.js` from the root so it can control the whole origin.

### SW-02 — Cache cleanup on `activate`
**Type:** [DETECT]
**Run:** `grep -nE "addEventListener\\(['\"]activate" sw.js 2>/dev/null; grep -nE "caches\\.(keys|delete)" sw.js 2>/dev/null`
**Parse:** whether the SW deletes stale caches when a new version activates. Note: this is a static-code check on `sw.js`; `caches.keys()` at runtime in the browser is a DevTools-only exercise.
**Emit finding if:** `activate` handler present but no `caches.keys().then(keys => keys.filter(...).map(caches.delete))` pattern → `medium` (stale caches accumulate forever).
**Evidence:** `sw.js:line` for the activate handler.
**Fix:** on `activate`, delete any cache whose name doesn't match the current version constant. Standard Workbox pattern; roll-your-own is a ~10-line block.

### SW-03 — Caching strategies per route
**Type:** [DETECT]
**Run:** `grep -nE "(caches\\.match|fetch\\(|event\\.respondWith)" sw.js 2>/dev/null`
**Parse:** which strategies are used for which URLs — cache-first, network-first, stale-while-revalidate.
**Emit finding if:** dynamic JSON API responses served cache-first without revalidation → `high` (users see stale data forever). HTML served cache-only → `high` (cannot ship updates).
**Evidence:** `sw.js:line` of the route handler.
**Fix:** stale-while-revalidate for GET APIs; network-first with cache fallback for HTML; cache-first for hashed assets.

### SW-04 — `skipWaiting` / `clientsClaim` usage
**Type:** [DETECT]
**Run:** `grep -nE "skipWaiting|clientsClaim|self\\.skipWaiting" sw.js 2>/dev/null`
**Parse:** update strategy.
**Emit finding if:** `skipWaiting()` called unconditionally → `medium` (can swap SW mid-session, breaking assumptions). No update strategy → `medium` (users stay on old SW forever).
**Evidence:** `sw.js:line`.
**Fix:** prompt the user when a new SW is waiting (`registration.waiting`), let them choose to refresh. Workbox `Workbox.messageSkipWaiting` pattern.

### SW-05 — Notification permission UX
**Type:** [ADVISE]
**Run:** `grep -rnE "Notification\\.requestPermission|PushManager" src/ app/ js/ sw.js 2>/dev/null`
**Parse:** when push permission is requested.
**Emit finding if:** `Notification.requestPermission()` called on page load (not in response to user gesture) → `high` (Chrome auto-blocks after 3 such prompts site-wide).
**Evidence:** file:line.
**Fix:** only request permission in response to a clear user action (button click that says "Enable notifications"). Explain the value first.

## CLS — Layout Stability

### CLS-01 — Image dimensions
**Type:** [DETECT]
See **IMG-01**. This is the primary check. Report here only by reference to avoid double-counting.
**Fix:** see IMG-01.

### CLS-02 — Font-swap CLS
**Type:** [DETECT]
See **FNT-05**. `size-adjust` / `ascent-override` on the fallback `@font-face` eliminates the shift when swap fires.
**Fix:** see FNT-05.

### CLS-03 — Reserved space for embeds and ads
**Type:** [DETECT]
**Run:** `grep -rnE '<iframe|<embed|adsbygoogle|class=["\47]ad' src/ app/ components/ 2>/dev/null`
**Parse:** whether embeds/ads are wrapped in a sized container.
**Emit finding if:** iframes / ads without fixed `width`+`height` or CSS `min-height` → `high`.
**Evidence:** file:line of unsized embed.
**Fix:** wrap in a div with explicit dimensions or `aspect-ratio` before the ad/embed loads.

### CLS-04 — `contain: layout` for independent sections
**Type:** [ADVISE]
**Run:** `grep -rnE 'contain:\s*(layout|paint|strict|content)' src/ app/ css/ 2>/dev/null`
**Parse:** usage of CSS containment.
**Emit finding if:** long-scroll pages with many independent cards/sections and no `contain: layout` → `info`.
**Evidence:** presence or absence.
**Fix:** add `contain: layout` to card-like components. Prevents layout changes inside one card from reflowing the rest of the page.

## CWV — Core Web Vitals Measurement

### CWV-01 — Run Lighthouse baseline
**Type:** [DETECT]
**Run:** `npx -y lighthouse <url> --output=json --output-path=./lighthouse.json --only-categories=performance --quiet --chrome-flags="--headless --no-sandbox"`
**Parse:** `categories.performance.score`, plus the four CWV metrics in `audits` (`largest-contentful-paint`, `cumulative-layout-shift`, `interaction-to-next-paint` or lab proxy `total-blocking-time`, `first-contentful-paint`).
**Emit finding if:** any metric in "poor" band → `critical`; "needs improvement" → `high`. Current thresholds: LCP poor > 4 s, needs-improvement 2.5–4 s; CLS poor > 0.25, needs-improvement 0.1–0.25; INP poor > 500 ms, needs-improvement 200–500 ms.
**Evidence:** Lighthouse JSON metric values.
**Fix:** map to top-contributor audits in the Lighthouse output; follow the specific guidance there.

### CWV-02 — Mobile vs desktop runs
**Type:** [DETECT]
**Run:** repeat CWV-01 with `--preset=desktop` for a second baseline.
**Parse:** delta between mobile and desktop scores.
**Emit finding if:** mobile score < 50 while desktop > 90 → `high` (mobile experience disproportionately bad).
**Evidence:** both scores.
**Fix:** the audit now focuses disproportionately on mobile. Throttled mobile is the default field condition.

### CWV-03 — Real User Monitoring (RUM) presence
**Type:** [DETECT]
**Run:** `grep -rnE "(web-vitals|@vercel/analytics|sendBeacon|NEXT_PUBLIC_VERCEL_ANALYTICS_ID)" src/ app/ js/ package.json .env* 2>/dev/null; grep -rnE "(gtag\\(|google-analytics|send_to)" src/ app/ js/ 2>/dev/null; grep -rnE "@sentry/(browser|nextjs).*tracesSampleRate" src/ app/ 2>/dev/null`
**Parse:** whether real-user CWV data is being collected.
**Emit finding if:** no RUM detected and app has > 1000 MAU → `medium` (flying blind on field data).
**Evidence:** matched grep hit or its absence.
**Fix:** install the `web-vitals` package and send metrics to your analytics backend. Vercel Analytics, Cloudflare Web Analytics, GA4 (with `send_to` for a CWV property), and Sentry Performance all work.

### CWV-04 — Lab-to-field mismatch check
**Type:** [ADVISE]
**Run:** open CrUX report for the origin (`https://pagespeed.web.dev/?url=<url>`), compare to CWV-01 lab numbers.
**Parse:** whether lab and field diverge materially.
**Emit finding if:** lab is "good" but field is "poor" → `info` (measurement is not representative).
**Evidence:** two numbers.
**Fix:** investigate: slow routes not in the lab run, heavy users on old devices, 3P scripts that only fire for logged-in sessions.

## MAN — Manifest & Installability

### MAN-01 — `manifest.json` present and linked
**Type:** [DETECT]
**Run:** `curl -sI <url>/manifest.json; curl -s <url> | grep -oE '<link[^>]+rel=["\47]manifest[^>]*>'`
**Parse:** manifest exists and is referenced from HTML.
**Emit finding if:** no `manifest.json` → `critical` for a declared PWA.
**Evidence:** HTTP status + link tag.
**Fix:** add `<link rel="manifest" href="/manifest.json">` in `<head>`. The manifest file must be valid JSON and served with `application/manifest+json` or `application/json`.

### MAN-02 — Required manifest fields
**Type:** [DETECT]
**Run:** `curl -s <url>/manifest.json | python3 -m json.tool`
**Parse:** presence of `name`, `short_name`, `icons`, `start_url`, `display`, `theme_color`, `background_color`.
**Emit finding if:** missing any of `name`, `icons`, `start_url`, `display` → `high`. Missing `theme_color` / `background_color` → `low`.
**Evidence:** manifest JSON excerpt.
**Fix:** fill in the required fields. `display: "standalone"` is the usual choice for app-like PWAs.

### MAN-03 — Icon sizes and maskable
**Type:** [DETECT]
**Run:** `curl -s <url>/manifest.json | python3 -c "import json,sys;m=json.load(sys.stdin);print([(i.get('sizes'),i.get('purpose')) for i in m.get('icons',[])])"`
**Parse:** icon sizes and `purpose` attributes.
**Emit finding if:** no 192×192 or 512×512 icon → `high`. No `purpose: "maskable"` icon → `medium` (Android adaptive-icon shapes will crop the standard icon ugly).
**Evidence:** icons array.
**Fix:** provide 192 and 512 at minimum, plus a maskable variant (see https://maskable.app). Use the same PNG at both sizes if needed; Lighthouse accepts larger.

## MOB — Mobile UX

### MOB-01 — Viewport meta tag
**Type:** [DETECT]
**Run:** `curl -s <url> | grep -oE '<meta[^>]+name=["\47]viewport[^>]*>'`
**Parse:** viewport meta present and sane.
**Emit finding if:** missing → `critical`. Has `user-scalable=no` or `maximum-scale=1.0` → `high` (accessibility violation; zoom is a basic need).
**Evidence:** meta tag.
**Fix:** `<meta name="viewport" content="width=device-width, initial-scale=1">`. Do not disable zoom.

### MOB-02 — Touch target size
**Type:** [DETECT]
**Run:** manually inspect CSS for interactive elements (`button`, `a`, `[role=button]`) and their computed size. Lighthouse's `tap-targets` audit flags offenders.
**Parse:** smallest hit-target size for primary CTAs.
**Emit finding if:** any primary interactive element < 24×24 CSS pixels → `high` (fails WCAG 2.5.8 AA — minimum target size, 2.5.8). Less than 44×44 → `medium` (misses WCAG 2.5.5 AAA — target size enhanced).
**Evidence:** Lighthouse `tap-targets` failures or CSS file:line.
**Fix:** ensure interactive elements are at least 24×24 CSS px to meet WCAG 2.5.8 AA (baseline). 44×44 is the AAA level 2.5.5 target and the iOS Human Interface Guidelines recommendation.

### MOB-03 — Safe-area insets
**Type:** [DETECT]
**Run:** `grep -rnE 'env\\(safe-area-inset' src/ app/ css/ 2>/dev/null`
**Parse:** whether CSS accounts for iPhone notch/home-indicator areas.
**Emit finding if:** PWA with `display: "standalone"` and no `env(safe-area-inset-*)` usage → `medium`.
**Evidence:** grep result.
**Fix:** add `padding-bottom: env(safe-area-inset-bottom)` to sticky footers, `padding-top: env(safe-area-inset-top)` to headers on standalone PWAs. Include `<meta name="viewport" content="viewport-fit=cover">`.

### MOB-04 — Orientation lock (if applicable)
**Type:** [ADVISE]
**Run:** `grep -oE '"orientation"[[:space:]]*:' manifest.json 2>/dev/null`
**Parse:** orientation value.
**Emit finding if:** app locks orientation without good reason → `info`. A game or tool that needs landscape may legitimately lock.
**Evidence:** manifest field.
**Fix:** prefer `"orientation": "any"` unless the UX genuinely requires one.

## NET — Network & Transport

### NET-01 — TTFB, edge vs origin
**Type:** [DETECT]
**Run:** `curl -w 'status=%{http_code} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n' -o /dev/null -sI <url>`
**Parse:** `ttfb` value. Cross-check with `x-cache`/`age`/`cf-cache-status` headers from CAC-05 to distinguish edge-cached from origin.
**Emit finding if:** edge-cached response TTFB > 100 ms → `medium`. Origin response TTFB > 200 ms → `high`. Origin response > 600 ms → `critical`.
**Evidence:** curl timing line + cache-status header.
**Fix:** edge-cached slowness means CDN / region mismatch — add PoPs or move origin closer. Origin-side slowness means server work: profile, add caching, pre-compute.

### NET-02 — HTTP/2 or HTTP/3
**Type:** [DETECT]
**Run:** `curl -sI --http2 <url> | head -1; curl -sI --http3 <url> 2>&1 | head -1`
**Parse:** protocol in the status line.
**Emit finding if:** HTTP/1.1 only → `high` (no multiplexing; head-of-line blocking on every request).
**Evidence:** status line.
**Fix:** terminate HTTP/2 or HTTP/3 at the CDN or load balancer. Modern CDNs provide both out of the box.

### NET-03 — Brotli compression
**Type:** [DETECT]
**Run:** `curl -sI -H 'Accept-Encoding: br, gzip' <asset-url> | grep -i content-encoding`
**Parse:** `Content-Encoding` value.
**Emit finding if:** text assets (HTML, CSS, JS, JSON, SVG) served with gzip-only or no encoding → `medium`. Brotli is typically 15–25% smaller than gzip.
**Evidence:** header.
**Fix:** enable Brotli at the CDN/origin. For hashed assets, use `brotli -Z` (max quality) at build time and serve pre-compressed; for dynamic responses, dynamic Brotli at quality 4–5.

### NET-04 — TLS 1.3
**Type:** [DETECT]
**Run:** `curl -vI <url> 2>&1 | grep -iE 'SSL connection|tlsv|ssl_version'`
**Parse:** negotiated TLS version.
**Emit finding if:** TLS 1.2 only (no 1.3) → `medium` (1.3 shaves a round trip on new connections).
**Evidence:** curl verbose output.
**Fix:** enable TLS 1.3 at the CDN/LB. All modern CDNs support it.

### NET-05 — `Vary: Accept-Encoding`
**Type:** [DETECT]
**Run:** `curl -sI <asset-url> | grep -i vary`
**Parse:** `Vary` header on compressed responses.
**Emit finding if:** custom caching layer (self-hosted Varnish, Nginx cache) serving compressed responses without `Vary: Accept-Encoding` → `medium`. Note: standard CDNs (Cloudflare, Fastly, CloudFront) handle this automatically — do NOT flag in those cases.
**Evidence:** header + architecture note.
**Fix:** add `Vary: Accept-Encoding` to compressed responses from custom caches. Otherwise a client that doesn't accept `br` could be served a cached Brotli response.

### NET-06 — Compression Dictionaries (emerging)
**Type:** [ADVISE]
**Run:** `curl -sI -H 'Accept-Encoding: dcb, dcz, br, gzip' <asset-url> | grep -iE 'content-encoding|available-dictionary'`
**Parse:** whether the server advertises compression-dictionary support.
**Emit finding if:** none — this is `info` only. Compression Dictionaries is an emerging standard that lets the browser reuse a prior response as a dictionary for future ones; not yet widely deployed.
**Evidence:** header inspection.
**Fix:** track the spec (https://datatracker.ietf.org/doc/draft-ietf-httpbis-compression-dictionary/). No action needed today.

## DAT — Data Fetching

### DAT-01 — Request waterfalls
**Type:** [DETECT]
**Run:** Lighthouse trace → Network panel. Also `grep -rnE 'await fetch|await axios' src/ app/ 2>/dev/null | head` for sequential awaits inside a single route loader.
**Parse:** whether a single page view issues requests in a chain where each waits on the previous.
**Emit finding if:** any critical-path waterfall ≥ 3 deep → `high`.
**Evidence:** network trace screenshot or file:line of chained awaits.
**Fix:** parallelize independent fetches with `Promise.all`. Push to the server via a single loader / Server Component / RSC that fans out server-side.

### DAT-02 — Over-fetching
**Type:** [ADVISE]
**Run:** inspect the largest JSON responses in the Lighthouse trace.
**Parse:** payload size vs. fields actually used in the component.
**Emit finding if:** > 50% of a JSON response is discarded by the consumer → `medium`.
**Evidence:** sample response shape + consumer component.
**Fix:** move to GraphQL with field selection, or add a BFF endpoint that projects just the fields the UI needs. REST `?fields=a,b,c` query params work when supported.

### DAT-03 — Client-side fetch client
**Type:** [DETECT]
**Run:** `grep -rnE "(swr|react-query|@tanstack/react-query|apollo|urql)" package.json 2>/dev/null`
**Parse:** presence of a proper data-fetching library.
**Emit finding if:** complex app with raw `fetch` + `useEffect` everywhere and no caching layer → `medium`.
**Evidence:** dependency list.
**Fix:** adopt SWR or React Query. They deduplicate, cache, revalidate on focus, and handle optimistic updates without custom code.

### DAT-04 — Optimistic updates
**Type:** [ADVISE]
**Run:** `grep -rnE "(onMutate|optimistic|mutate\\()" src/ app/ 2>/dev/null`
**Parse:** whether mutations update UI before server confirms.
**Emit finding if:** mutation-heavy UI (likes, toggles, form saves) blocks user on round-trip → `info`.
**Evidence:** component code.
**Fix:** apply the mutation to cache immediately, reconcile on server response. React Query's `onMutate` + rollback is the canonical pattern.

## FWK — Framework-Specific Checks

Gated by FW-00. Run only the sub-block matching the detected stack; mark the rest `not-applicable`.

### FWK-NEXT — Next.js
**Type:** [DETECT]
**Run:** `cat next.config.* 2>/dev/null; grep -rnE '"use client"|"use server"' src/ app/ 2>/dev/null | wc -l; grep -rnE 'next/dynamic|next/image|next/font' src/ app/ 2>/dev/null | wc -l`
**Parse:** app/ vs pages/ router, frequency of `"use client"`, use of `next/image`, `next/font`, `dynamic()`.
**Emit finding if:** App Router with `"use client"` on every top-level route → `high` (defeats RSC benefits). Using `<img>` instead of `next/image` for non-external hosts → `high`. Using `<link>` Google Fonts instead of `next/font` → `medium`.
**Evidence:** file:line counts.
**Fix:** push `"use client"` to interactive leaves only. Replace `<img>` with `next/image` (get AVIF/WebP + srcset + lazy). Use `next/font` for self-hosted fonts with auto-fallback.

### FWK-ASTRO — Astro
**Type:** [DETECT]
**Run:** `grep -rnE 'client:(load|idle|visible|media|only)' src/ 2>/dev/null | sort | uniq -c`
**Parse:** distribution of hydration directives.
**Emit finding if:** most components use `client:load` (eager) → `medium`. Interactive component with no `client:*` directive → `high` (won't hydrate).
**Evidence:** grep output.
**Fix:** prefer `client:idle` or `client:visible` over `client:load`. Audit each `client:load` for necessity.

### FWK-HOTWIRE — Hotwire (Turbo + Stimulus)
**Type:** [DETECT]
**Run:** `grep -rnE 'turbo-frame|turbo-stream|data-controller' app/views/ 2>/dev/null; grep -rnE 'data-turbo-' app/views/ 2>/dev/null`
**Parse:** use of Turbo Frames / Streams and Stimulus controllers.
**Emit finding if:** full-page reloads where a Turbo Frame would suffice → `medium`. Stimulus controller loaded on every page but only used on one → `medium`.
**Evidence:** file:line.
**Fix:** wrap sections that update independently in `<turbo-frame>`. Lazy-load Stimulus controllers via `import('...')` in a route-scoped controller.

### FWK-SVELTE — SvelteKit
**Type:** [DETECT]
**Run:** `grep -rnE "export (const|async function) load" src/routes/ 2>/dev/null | wc -l; grep -rnE "prerender\\s*=\\s*true" src/routes/ 2>/dev/null`
**Parse:** use of load functions and `prerender`.
**Emit finding if:** static routes (marketing, docs) without `export const prerender = true` → `medium`.
**Evidence:** file:line.
**Fix:** mark static routes for prerender. SvelteKit ships them as static HTML at build time.

### FWK-VUE — Nuxt / Vue CSR
**Type:** [DETECT]
**Run:** `cat nuxt.config.* 2>/dev/null; grep -rnE 'defineAsyncComponent|<LazyComponent' src/ app/ pages/ components/ 2>/dev/null`
**Parse:** SSR flag and use of async components.
**Emit finding if:** Nuxt with `ssr: false` on content-heavy pages → `high`. Vue CSR with no route-level code splitting → `high`.
**Evidence:** config + grep.
**Fix:** for Nuxt keep `ssr: true` unless genuinely an app-only page. Use `defineAsyncComponent` for heavy, non-critical components.

### FWK-VANILLA — Vanilla PWA
**Type:** [DETECT]
**Run:** confirm no build config exists; verify manual SW and import patterns.
**Parse:** script loading strategy, module structure.
**Emit finding if:** large single `app.js` (> 100 KB) with no code splitting → `medium`. Synchronous script tags for non-critical features → `medium`.
**Evidence:** file size + HTML.
**Fix:** split by feature, load via `<script type="module">` with dynamic `import()` for route/feature boundaries.

## BLD — Build & Deploy

### BLD-01 — Source maps not leaking to production
**Type:** [DETECT]
**Run:** identify a hashed asset URL, then `curl -sI <asset>.js.map | head -1`
**Parse:** HTTP status of the `.map` file.
**Emit finding if:** `HTTP/* 200` returned for a production `.map` → `medium` (exposes original source to anyone; occasionally `high` if proprietary). Debatable — many teams ship maps intentionally for Sentry. Flag, don't mandate.
**Evidence:** curl status line.
**Fix:** if unintentional, disable source-map generation for production builds or upload to Sentry then delete from the public bundle. If intentional, note the decision.

### BLD-02 — Tree shaking actually works
**Type:** [DETECT]
**Run:** `npx source-map-explorer <main-bundle.js>` — inspect the treemap for packages that should have been tree-shaken.
**Parse:** presence of unused exports in the bundle.
**Emit finding if:** `lodash` appears with > 30 KB, `rxjs` with > 50 KB, or MUI with > 100 KB of unused code → `medium`.
**Evidence:** source-map-explorer screenshot or output.
**Fix:** see JS-02. Confirm `sideEffects: false`, ES module imports, deep imports on packages that don't tree-shake well.

### BLD-03 — Size-limit / performance budgets in CI
**Type:** [DETECT]
**Run:** `grep -E '"(size-limit|bundlesize|bundlewatch)"' package.json; grep -rE 'size-limit|bundlesize' .github/workflows/ 2>/dev/null`
**Parse:** presence of budget enforcement.
**Emit finding if:** no budget check in CI and app is actively developed → `medium`.
**Evidence:** config presence.
**Fix:** add `size-limit` (https://github.com/ai/size-limit) with explicit budgets (e.g. `{ path: 'dist/index.js', limit: '150 KB' }`). Fail CI on regression.

### BLD-04 — Lighthouse CI
**Type:** [ADVISE]
**Run:** `ls .lighthouserc* 2>/dev/null; grep -r lighthouse .github/workflows/ 2>/dev/null`
**Parse:** presence of Lighthouse CI.
**Emit finding if:** no perf regression check in CI → `info`.
**Evidence:** config presence.
**Fix:** add `@lhci/cli` with asserted thresholds. https://github.com/GoogleChrome/lighthouse-ci.

## PRF — Perceived Performance

### PRF-01 — bfcache eligibility
**Type:** [DETECT]
**Run:** `grep -rnE "addEventListener\\(['\"]unload|window\\.onunload" src/ app/ js/ 2>/dev/null; curl -sI <page-url> | grep -iE 'cache-control'`
**Parse:** presence of `unload` handlers or `Cache-Control: no-store` on HTML (either kills bfcache).
**Emit finding if:** any `unload` handler → `high`. `Cache-Control: no-store` on HTML → `high` (unless required for compliance). `beforeunload` handler that fires unconditionally → `medium`.
**Evidence:** file:line + header.
**Fix:** replace `unload` with `pagehide` (fires reliably, bfcache-compatible). Use `no-cache` instead of `no-store` on HTML unless PII storage policy requires otherwise. Only attach `beforeunload` when there are actually unsaved changes.

### PRF-02 — `content-visibility: auto` on long off-screen content
**Type:** [ADVISE]
**Run:** `grep -rnE 'content-visibility' src/ app/ css/ 2>/dev/null`
**Parse:** usage.
**Emit finding if:** long-scroll page (thousands of DOM nodes, comment threads, long lists) with no `content-visibility: auto` → `info`.
**Evidence:** grep result + DOM-size audit from Lighthouse.
**Fix:** add `content-visibility: auto; contain-intrinsic-size: 0 500px` to repeating card-like containers below the fold. Pair with `contain-intrinsic-size` to avoid scrollbar jump.

### PRF-03 — View Transitions API
**Type:** [ADVISE]
**Run:** `grep -rnE 'startViewTransition|view-transition-name' src/ app/ css/ 2>/dev/null`
**Parse:** usage.
**Emit finding if:** SPA with visibly abrupt route transitions and no view-transition usage → `info`.
**Evidence:** grep result.
**Fix:** wrap navigation in `document.startViewTransition(() => updateUI())`. Progressively enhanced — no-op on browsers that don't support it.

### PRF-04 — Skeleton screens / optimistic UI
**Type:** [ADVISE]
**Run:** `grep -rnE "(skeleton|shimmer|placeholder|<Suspense)" src/ app/ components/ 2>/dev/null | wc -l`
**Parse:** presence of loading skeletons.
**Emit finding if:** slow data-heavy routes show a blank screen or spinner for > 500 ms → `info`.
**Evidence:** observed blank interval + absence of skeleton component.
**Fix:** render a skeleton matching the final layout immediately, stream real content into the shell. `<Suspense fallback={<Skeleton />}>` is the React idiom.

## REDFLAG — Anti-Patterns

These are unambiguous mistakes. Emit as `critical` or `high` on detection.

### REDFLAG-01 — `document.write`
**Type:** [DETECT]
**Run:** `grep -rn 'document\\.write' src/ app/ js/ public/ 2>/dev/null`
**Emit finding if:** any hit outside of vendored 3P code → `critical`. `document.write` after page load invalidates the document and causes catastrophic layout thrash.
**Evidence:** file:line.
**Fix:** replace with DOM APIs (`createElement`, `appendChild`, `insertAdjacentHTML`).

### REDFLAG-02 — `eval` / `new Function`
**Type:** [DETECT]
**Run:** `grep -rnE "\\beval\\(|new Function\\(" src/ app/ js/ 2>/dev/null | grep -vE 'eslint|//.*eval'`
**Emit finding if:** any hit → `high` (blocks JIT optimization, CSP violation, security risk).
**Evidence:** file:line.
**Fix:** static alternatives. For dynamic logic, use a safe expression evaluator or lookup tables.

### REDFLAG-03 — Polling where push would work
**Type:** [DETECT]
**Run:** `grep -rnE 'setInterval.*fetch|setInterval.*axios' src/ app/ js/ 2>/dev/null`
**Emit finding if:** polling at < 10 s intervals for data that could be streamed → `high`.
**Evidence:** file:line + interval.
**Fix:** use WebSockets, Server-Sent Events, or native `EventSource` for server push. For less real-time data, at least back off intervals exponentially.

### REDFLAG-04 — `@import` in CSS
**Type:** [DETECT]
**Run:** `grep -rnE "^@import" src/ app/ css/ public/ 2>/dev/null`
**Emit finding if:** any `@import` in a CSS file loaded on the critical path → `high` (serialises CSS loads; each import is a round trip before CSS parses).
**Evidence:** file:line.
**Fix:** replace with multiple `<link rel="stylesheet">` tags, a build-time CSS bundler (PostCSS `@import`, Vite, esbuild), or inline.

### REDFLAG-05 — Animating layout properties
**Type:** [DETECT]
**Run:** `grep -rnE 'transition[^;]*:[^;]*(width|height|top|left|margin|padding)' src/ app/ css/ 2>/dev/null`
**Emit finding if:** transitions/animations on non-composited properties → `medium`.
**Evidence:** file:line.
**Fix:** animate `transform` and `opacity` instead — composited on the GPU, no layout pass per frame.

### REDFLAG-06 — Synchronous XHR
**Type:** [DETECT]
**Run:** `grep -rnE "\\.open\\([^)]*,[^,]*,[^)]*false\\)" src/ app/ js/ 2>/dev/null`
**Emit finding if:** any synchronous `XMLHttpRequest.open(..., false)` → `critical`.
**Evidence:** file:line.
**Fix:** replace with `fetch()` or async XHR.

## Output Template

Fill in this structure. Keep each section honest — do not invent findings to pad the report.

```markdown
# PWA Audit — <site name> — <YYYY-MM-DD>

## Executive Summary

- <highest-severity finding in one sentence>
- <second-highest finding>
- <biggest single win available and its effort>
- <one thing done well, for calibration>
- <overall posture: critical issues present / solid / polished>

## Measurement Baseline

- **Commit:** <sha>
- **URL audited:** <url>
- **Lighthouse version:** <version>
- **Date:** <YYYY-MM-DD>
- **Device:** <mobile emulated / desktop>
- **Network throttle:** <4G / slow 4G / none>
- **Framework detected:** <from FW-00>

## Findings

### Critical

<list of finding JSON blocks, each following the schema in section 1>

### High

<...>

### Medium

<...>

### Low

<...>

### Info (Opportunities)

<...>

## Triage Summary — Top 5 Quick Wins

Ordered by effort ascending, severity descending.

1. **<id>** — <one-line fix> (effort: trivial, severity: high)
2. ...
3. ...
4. ...
5. ...

## Blocked / Not Applicable

<findings that couldn't be evaluated, with the reason>
```

End of runbook.






