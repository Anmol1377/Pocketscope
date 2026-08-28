# Pocketscope — Build Plan

The order to actually build this in. Read [PRD.md](PRD.md) for *what*, this is *how*.

**Stack: React Native (Expo) + `react-native-webview`. No Android Studio, no Xcode.**

---

## The key decision: wrap Eruda for v1

ARCHITECTURE.md describes building `agent.js` + a bridge + our own DevTools UI from
scratch. Don't, not yet.

[Eruda](https://github.com/liriliri/eruda) (MIT, single JS file) already implements
Console, Elements, Network, Resources, and Info. Its only real limitation is that the
site owner must add a script tag — irrelevant here, because **we are the browser and we
inject it ourselves.**

So v1 is: a browser shell that injects Eruda into every page.

| | Build own agent + UI | Wrap Eruda |
|---|---|---|
| Lines to first working build | ~3000 | ~90 |
| Time to validate the idea | 3 weeks | 1 evening |
| Differentiator preserved (any URL, no site changes) | Yes | Yes |

Build our own panels only after users confirm they want the product.
ARCHITECTURE.md stays valid — it's the v2 design for when Eruda's ceiling is hit.

## What React Native costs and buys

| | |
|---|---|
| ✅ No Android Studio | Expo Go runs it from a QR code; EAS builds the APK in the cloud |
| ✅ Injection before page scripts | `injectedJavaScriptBeforeContentLoaded` — solves the early-`console.log` miss for free |
| ✅ Bridge is built in | `window.ReactNativeWebView.postMessage` → `onMessage`. No `addJavascriptInterface` |
| ✅ JS runner is built in | `webviewRef.injectJavaScript(code)` |
| ✅ iOS nearly free | Same code. Was a v3 item on the native plan |
| ❌ No `shouldInterceptRequest` | **Can't capture the top-level document request or non-JS subresource traffic.** Only real loss |
| ⚠️ Android injection timing | "Before content loaded" is best-effort on Android, guaranteed on iOS. Inject in both props (see App.js) |

## Step 0 — Prove the injection ✅ scaffolded

Project is set up in this folder: Expo SDK 57, RN 0.86, `react-native-webview` 13.16.
Bundles clean (585 modules). [App.js](App.js) has the URL bar, back, reload, and Eruda
injected from CDN into every page.

```bash
npm start     # scan the QR with Expo Go
```

**Pass condition:** load 3 real sites, tap the Eruda bubble, see console output and
network requests for each. If this fails, stop and fix it — nothing else matters.

## Step 1 — Browser shell (~3 days)

- Search fallback for non-URLs (already stubbed in App.js)
- Forward, stop, loading indicator
- History and bookmarks — `AsyncStorage` and a JSON blob. Not a database yet
- Desktop-UA toggle (`userAgent` prop)
- Tabs — only if step 2 says people use it

## Step 2 — Put it in 10 developers' hands (1 day)

```bash
npx eas build -p android --profile preview   # APK, built in the cloud
```

Share the APK link. The question is not "is it polished". It's **"did anyone open it
twice?"** Answer that before writing another feature.

## Step 3 — The gap features (~1 week)

Only what Eruda structurally cannot do, because it isn't the browser:

- **Copy request as cURL** — the single most-used DevTools action, and Eruda lacks it
- **HttpOnly cookies** — `@react-native-cookies/cookies`; invisible to any injected JS.
  Not in Expo Go, so this is what forces the move to an EAS dev build
- **Share session** — logs + requests as text, out via RN's `Share` API
- **Per-site kill switch** — when injection breaks a page, let the user turn it off
- **Pull requests into RN** — `onMessage` from a patched `fetch`, so the app owns the
  data and can export it even while Eruda renders it

## Step 4 — Replace Eruda's UI (only if step 2 said yes)

One panel at a time, most-used first (Network, then Console). Now ARCHITECTURE.md
applies — with `postMessage`/`onMessage` in place of the native bridge it describes.
Keep Eruda installed as a fallback until each replacement is better than what it replaced.

## Cut from the PRD

| Cut | Why |
|---|---|
| Remote Inspect (v3) | This is exactly the space Eruda/weinre already own. Weakest idea in the PRD — build only if users ask |
| Own Elements tab | Eruda gives it free |
| Document-request capture | Not reachable from `react-native-webview`. Accepted cost of the RN choice |
| Request replay, HAR export | Real features, but nothing until step 2 passes |

**Promoted:** iOS. It was v3 on the native plan; on RN it's the same code, so ship it
whenever a Mac is available for the build. (App Store review is stricter on browsers
than Play — expect questions.)

## Cost

Nothing, through step 2.

| Stage | Needs | Cost |
|---|---|---|
| Step 0–1 | Expo Go + QR code | Free, unlimited |
| Step 2 | 1 APK build | Expo free tier: 15 Android builds/month |
| Step 3 | Dev build (native module) | Same free tier |

If the free build quota is ever a problem, `eas build -p android --profile preview --local`
is free and unlimited — it needs the Android SDK and a JDK but *not* Android Studio
(`brew install --cask android-commandlinetools && brew install openjdk@17`). The same
command runs on GitHub Actions' free minutes with nothing installed locally.

**The real cost is Expo Go compatibility, not money.** The first native module — step 3's
`@react-native-cookies/cookies` — ends the zero-friction QR-code loop and forces a dev
build. Don't add a native dependency casually.

## Definition of done for v1

A developer installs it, types a URL, and finds a bug they'd otherwise have needed a
laptop to find. Nothing else ships until that sentence is true.
