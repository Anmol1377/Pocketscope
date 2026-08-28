# Pocketscope — TODO

See [BUILD.md](BUILD.md) for the reasoning behind the order.

## Done

- [x] Expo + `react-native-webview` shell, dev client built (SDK 56)
- [x] Eruda injected into every page — works on any URL, no site cooperation
- [x] Own agent: captures console, fetch/XHR, and storage into React Native
- [x] DevTools drawer — Network / Console / Storage tabs, drag to resize
- [x] Scope trace — live request readout, doubles as the drawer handle
- [x] Copy any request as cURL; share whole session
- [x] Console JS prompt — runs expressions against the live page
- [x] Perf tab — Core Web Vitals, load timing, weight, slowest resources
- [x] Console and Network follow the newest line (stop following when you scroll up)
- [x] Instrument UI — IBM Plex, graphite palette, vector icons
- [x] Start page setting — Pocketscope page, Google, or any URL of your own
- [x] Landing page at [docs/index.html](docs/index.html), bundled into the app as the start page
- [x] Android emulator set up locally (`npm run emu`) — no Android Studio
- [x] **Verified on emulator:** captured real requests on github.com (4 × 200, timings, status rails)

## Fixed during testing

- Agent injected only at page-load-end, so it patched `fetch`/`XHR` *after* the page
  had already made its calls — nothing was captured. Now injected at document-start too.
- Every native module (`async-storage`, `expo-font`, `vector-icons`, `safe-area-context`,
  `clipboard`) is now optional via [native.js](native.js). A dev client built before a
  module was added degrades instead of crashing.
- Request ids came from the injected agent and reset on every navigation, so React keys
  collided across pages. Ids now assigned in React Native.
- Start page no longer depends on GitHub Pages being live — it is bundled.
- Eruda is loaded on demand (⋯ → Open Eruda); its floating button covered the toolbar.
- Console prompt used `eval()`, which strict-CSP sites ('unsafe-eval' not allowed) refuse —
  github.com among them. The source is now injected directly instead of eval'd.
- Console list did not scroll to the newest entry, so results appeared below the fold.
- The address bar went blank after navigating: its displayed value depended on an
  `editing` flag that navigation callbacks read as a stale closure. The field now has
  one source of truth, with focus tracked in a ref.
- `{...StyleSheet.absoluteFillObject}` spread to nothing, so every "absolute" overlay
  laid out in normal flow — the WebView and all full-screen screens rendered blank or
  stacked. Positions are now written out explicitly.
- Writing the WebView's reported url back into the prop that drives `source` made it
  re-issue the load; the start page's baseUrl then failed as a real DNS lookup. A tab
  now tracks `src` (what we asked for) separately from `url` (where it is).

## Next — publish the landing page

- [ ] Push to `github.com/Anmol1377/Pocketscope` (repo currently returns 404 — create it or make it public)
- [ ] Repo → Settings → Pages → Source: `main` branch, `/docs` folder
- [ ] Confirm https://anmol1377.github.io/Pocketscope/ resolves (the app's default start page)
- [ ] Add repo description and topics

## Step 1 — browser shell ✅

- [x] Tabs, kept mounted so state survives a switch
- [x] Private tabs (`incognito`) — no cookies or history kept, amber rule on the toolbar
- [x] History, searchable, backed by AsyncStorage
- [x] Bookmarks, searchable
- [x] Downloads — handed to Android's download manager, no file-system module needed
- [x] Clear browsing data — per-item checkboxes: cookies, site storage, cache,
      form data, page history, browsing history, downloads, captured data
- [x] Eruda opens dark and is back-filled with console output from before it loaded
- [x] Settings screen — start page, desktop UA, keep-log, clear data
- [x] Captured data is per tab and clears on each page load (toggle to keep it)
- [x] Clear button in the drawer; Eruda opens in dark theme

- [x] Tap to inspect — touch highlights, tap reports selector, DOM path, box model,
      computed styles and outerHTML
- [x] Audit tab — mobile-specific checks: viewport meta, mixed content, oversized
      images, tap-target size, sideways scroll, alt text, lang attribute
- [x] Network filter — search by URL/method/status, and a failed-only toggle

- [ ] Find in page
- [ ] Command history in the console prompt (up-arrow recall)
- [ ] Tab thumbnails

## Step 2 — ship it

- [ ] `eas build --profile preview` → APK to 10 developers
- [ ] The only question that matters: did anyone open it twice?

## Step 3 — the gap features

What Eruda structurally cannot do, because it isn't the browser:

- [ ] HttpOnly cookies via `CookieManager` — invisible to any injected script
- [ ] Document request captured natively (needs a native module; see limits below)
- [ ] Request replay — edit method/headers/body, re-send
- [ ] HAR export
- [ ] Per-site kill switch for when injection breaks a page

## Step 4 — only if step 2 says yes

- [ ] Full DOM tree (tap-to-inspect covers the common case)
- [ ] Resource timing via `PerformanceObserver` (images, CSS, fonts)
- [ ] WebSocket frames
- [ ] iOS build

## Known limits

Stated in the UI, not hidden:

| Not captured | Why |
|---|---|
| Images, CSS, fonts | Never pass through `fetch`/`XHR` |
| Document request | Happens before the agent exists; `react-native-webview` exposes no `shouldInterceptRequest` |
| HttpOnly cookies | Invisible to injected JS by design |
| Cross-origin iframes | Same-origin policy — not fixable |
| Service Worker requests | Different JS context |

## Build budget

15 free Android builds/month. Used 3, 12 left. **JS changes never need a build** — only new native modules do.
