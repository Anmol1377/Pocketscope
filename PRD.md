# Pocketscope — Product Requirements

**Status:** Draft v1
**Owner:** datalabs@inc42.com
**Last updated:** 2026-08-28

---

## 1. Problem

Mobile web bugs happen on mobile devices, but the tools to debug them live on a desktop.
The current options all cost a laptop, a cable, or both:

| Today's option | What it costs |
|---|---|
| `chrome://inspect` over USB | Laptop + cable + USB debugging enabled |
| Safari Web Inspector | Mac + iPhone + a settings toggle on each |
| Eruda / vConsole | You must own the site and ship a script tag |
| Charles / HTTP Toolkit | Proxy setup + CA cert install per device |

Nothing lets a developer open an arbitrary URL on a phone and immediately see the
console, the network calls, and the storage for that page.

## 2. Users

**Primary — Mobile web developer.** Building a responsive site, needs to check a
layout or an API call on a real device without walking back to the desk.

**Secondary — QA / support engineer.** Reproducing a customer bug on a real handset;
needs to capture the failing request and the console error as evidence.

**Tertiary — Backend / API developer.** Wants to hit an endpoint, see headers, status,
and JSON response, without a desktop client.

## 3. Goals

- Inspect any URL on a phone with zero setup on the target site
- Read console output, network traffic, and storage in under three taps from page load
- Share what you found (log, request, response) as text or a screenshot
- Stay usable one-handed on a 5" screen

## 4. Non-goals

Explicitly out, and the reason:

| Non-goal | Why |
|---|---|
| Replacing Chrome DevTools | Full CDP parity is years of work for a device where you can't read it anyway |
| Being a daily-driver browser | No sync, no password manager, no extensions. It's a tool, not a browser |
| Editing and saving CSS back to source | Nice demo, no workflow behind it |
| Inspecting native apps or other browsers' tabs | OS sandboxing makes this impossible without root |
| A pure website version | See §7 — a website cannot inspect another origin. Non-negotiable browser security |

## 5. Feature scope

### v1 — MVP

The bar for v1: a developer can find a bug they could otherwise only find with a laptop.

1. **Browser shell** — URL bar, back/forward/reload, one tab, history, bookmarks.
2. **Console** — `log / warn / error / info / debug`, uncaught exceptions,
   unhandled promise rejections. Filter by level, text search, tap to expand objects.
3. **Network** — every `fetch` and `XMLHttpRequest`: method, URL, status, duration, size.
   Tap a row for request headers, request body, response headers, response body
   (pretty-printed JSON). Filter by status class and by XHR/fetch.
4. **Storage** — LocalStorage, SessionStorage, Cookies. Read, edit, delete a key, clear all.
5. **JS runner** — evaluate an expression against the live page, see the returned value.
6. **Device info** — user agent, viewport, DPR, online status, platform.
7. **Copy / share** — any log line, any request as cURL, the whole session as text.

### v2

8. **Elements** — collapsible DOM tree, tap a node to highlight it in the page,
   see computed styles and box model.
9. **Resource timing** — images, CSS, fonts, and scripts via `PerformanceObserver`
   (timings only, no bodies — see ARCHITECTURE.md §4).
10. **Request replay** — edit method, headers, or body of a captured call and re-send it.
11. **Device emulation** — spoof user agent, force desktop viewport.
12. **Session export** — HAR file, shareable to Slack/email.

### v3

13. **Remote Inspect** — scan a QR code from a page running the Pocketscope snippet;
    the phone becomes a live dashboard for that page, wherever it's running.
14. **iOS** — WKWebView port.
15. **Performance** — Core Web Vitals (LCP, CLS, INP) captured per page load.

## 6. UX

Single screen, two panes, drag-to-resize divider:

```
┌─────────────────────────────────────┐
│  ←  →   https://example.com     ⋮   │
├─────────────────────────────────────┤
│                                     │
│            THE PAGE                 │
│                                     │
├══════ drag to resize ═══════════════┤
│ Console  Network  Storage  Elements │
├─────────────────────────────────────┤
│ ⚠ TypeError: u is not a function    │
│   app.js:14                         │
│ ▸ POST /api/login    401    83ms    │
│                                     │
├─────────────────────────────────────┤
│ >  _                          [Run] │
└─────────────────────────────────────┘
```

Rules:
- The drawer collapses to a pill showing unread error and failed-request counts.
  A red badge is how you learn something broke without looking.
- Everything is long-press-to-copy. On a phone, copy is the primary export.
- Monospace, 12sp minimum, horizontal scroll for long lines. Never wrap a URL.
- Dark theme default.

## 7. Key constraint: this cannot be a website

A web page cannot read the console, network, storage, or DOM of a page from another
origin. That is the same-origin policy, and it is the security boundary the whole web
depends on. An iframe of `example.com` is opaque to its parent.

So the product has exactly three viable shapes:

| Shape | Reach | Power | Verdict |
|---|---|---|---|
| Website / PWA | Any device, zero install | Can only inspect itself | Rejected |
| Injectable snippet (Eruda-style) | Any site you control | Full, but needs a script tag on the target | v3 as Remote Inspect |
| **Native browser with WebView** | Install required | Full, on any URL, zero site changes | **Chosen for v1** |

v1 is an Android app. Android ships the largest developer population on mobile and
`WebView` allows the JS injection this depends on. iOS follows in v3.

## 8. Success metrics

- **Activation:** ≥60% of installs inspect at least one non-example URL in week 1
- **Core value:** ≥40% of sessions open the Network or Console tab
- **Retention:** ≥25% W4 retention (a tool, not a daily app — weekly use is the win)
- **Qualitative:** "I found a bug without opening my laptop" appears unprompted in reviews

## 9. Risks

| Risk | Mitigation |
|---|---|
| Injected agent breaks a site by patching `fetch`/`console` | Patch defensively, preserve originals, pass through on any error; kill-switch per site |
| Network capture misses non-JS requests (img, css, beacon) | Say so in the UI. Add resource timing in v2 |
| Screen too small to read a DOM tree | Ship Console + Network first, prove value before Elements |
| Google Play flags it as a browser and demands extra compliance | Position as a developer tool; no default-browser role requested |
| "Just use Eruda" | Eruda needs a script tag on the target. Pocketscope works on any URL, including production and sites you don't own |

## 10. Open questions

1. Does the injected agent capture requests from cross-origin iframes, or only the top frame?
   (Leaning: top frame only in v1.)
2. Do we persist sessions across app restart, or is history disposable?
3. Free vs paid: is v1 free with Remote Inspect as the paid tier?
