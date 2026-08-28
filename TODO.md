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
- [x] Start page setting — Pocketscope page or Google, persisted
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

## Next — publish the landing page

- [ ] Push to `github.com/Anmol1377/Pocketscope` (repo currently returns 404 — create it or make it public)
- [ ] Repo → Settings → Pages → Source: `main` branch, `/docs` folder
- [ ] Confirm https://anmol1377.github.io/Pocketscope/ resolves (the app's default start page)
- [ ] Add repo description and topics

## Step 1 — browser shell

- [ ] History, backed by AsyncStorage (already installed)
- [ ] Bookmarks
- [ ] Tabs
- [ ] Desktop user-agent toggle
- [ ] Find in page
- [ ] Command history in the console prompt (up-arrow recall)

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

- [ ] Own Elements tab, retire Eruda
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
