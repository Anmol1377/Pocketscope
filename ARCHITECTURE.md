# Pocketscope — Architecture

How the inspection actually works, and what it can't see.

## 1. Shape

```
┌──────────────────────────────────────────┐
│  Android app (Kotlin)                    │
│                                          │
│  ┌────────────────┐   ┌────────────────┐ │
│  │  WebView       │   │  DevTools UI   │ │
│  │  (the page)    │   │  (Compose)     │ │
│  │                │   │                │ │
│  │  + agent.js  ──┼──▶│  event stream  │ │
│  │                │◀──┼── eval()       │ │
│  └────────────────┘   └────────────────┘ │
└──────────────────────────────────────────┘
```

One `WebView` renders the page. One JS file — `agent.js` — is injected into every
document before its own scripts run. The agent patches the browser APIs we care about
and posts every event over a `JavascriptInterface` bridge to Kotlin, which renders it.

There is no server and no proxy. Everything happens on the device.

## 2. The agent

Injected via `WebViewClient.onPageStarted` → `evaluateJavascript`, plus a re-inject
on `shouldInterceptRequest` for the document to win the race against inline scripts.
It is a single IIFE, no dependencies, and it hoards the originals before patching:

```js
(function () {
  const send = (type, data) => PocketscopeBridge.post(JSON.stringify({type, data, t: Date.now()}));

  // console
  for (const level of ['log','warn','error','info','debug']) {
    const original = console[level];
    console[level] = function (...args) {
      try { send('console', {level, args: args.map(serialize)}); } catch {}
      return original.apply(console, args);   // page behaviour never changes
    };
  }

  // errors
  addEventListener('error', e => send('error', {msg: e.message, src: e.filename, line: e.lineno}));
  addEventListener('unhandledrejection', e => send('error', {msg: String(e.reason), kind: 'promise'}));

  // fetch
  const originalFetch = fetch;
  self.fetch = async function (input, init) {
    const id = nextId(), started = performance.now();
    send('net:start', {id, url: String(input?.url ?? input), method: init?.method ?? 'GET', headers: init?.headers, body: init?.body});
    try {
      const res = await originalFetch.apply(this, arguments);
      const clone = res.clone();                      // clone, never consume the page's copy
      send('net:done', {id, status: res.status, ms: performance.now() - started,
                        headers: [...res.headers], body: await clone.text()});
      return res;
    } catch (err) { send('net:fail', {id, error: String(err)}); throw err; }
  };

  // XHR — same idea on open/send/loadend
})();
```

**The two rules the agent must never break:**
1. Always call the original. A patched API that changes page behaviour makes the tool
   a liar — you'd be debugging Pocketscope, not the site.
2. Every hook body is wrapped in try/catch. An exception inside our instrumentation
   must never surface as an exception in the page.

Response bodies are read from `res.clone()`. Consuming the page's own response would
break it. Bodies over 1 MB are truncated with a marker.

## 3. Bridge

`addJavascriptInterface` exposes one method: `post(String json)`. Kotlin parses,
appends to an in-memory ring buffer (cap ~2000 events, oldest dropped), and Compose
renders from that. The JS runner goes the other direction via `evaluateJavascript`,
result returned as JSON.

The bridge is registered only on the inspection WebView, and the interface is added
before any URL loads.

**Security note:** `addJavascriptInterface` gives loaded pages a call into native code.
The exposed surface is exactly one method that accepts a string and only ever appends
to a buffer — no file, no intent, no reflection reachable from it. Keep it that way.

## 4. What this cannot see — be honest in the UI

| Not captured | Why | Fix |
|---|---|---|
| `<img>`, `<link>`, `<script>` requests | Never go through `fetch`/`XHR` | v2: `PerformanceObserver('resource')` — timings only, no bodies |
| `navigator.sendBeacon`, EventSource | Separate APIs | Patch them too, same pattern |
| The top-level document request | Happens before the agent exists | Read it from `shouldInterceptRequest` on the Kotlin side |
| HttpOnly cookies | Invisible to `document.cookie` by design | Read via Android `CookieManager` instead |
| Cross-origin iframe internals | Same-origin policy | Not fixable. Say so |
| Requests from a Service Worker | Different JS context | v2: inject into the SW scope |
| WebSocket frames | Not patched in v1 | v2: patch the `WebSocket` constructor |

Ship the Network tab with a footer line: *"fetch + XHR only"*. A tool that silently
omits traffic is worse than one that admits its scope.

## 5. Storage

- LocalStorage / SessionStorage — read and write straight through the agent.
- Cookies — `document.cookie` from the agent for the readable ones, Android
  `CookieManager` for HttpOnly. Merge, and mark which came from where.
- IndexedDB — v2. Async, structured-clone values, needs its own serializer.

## 6. Elements (v2)

Walk the DOM in the agent, emit a flattened `{id, parentId, tag, attrs, childCount}`
list, lazy-load children on expand. A 5000-node tree serialized in one shot will hang
the bridge — page in.

Highlight-on-tap is an absolutely-positioned overlay `div` drawn from
`getBoundingClientRect()`, not a native overlay. Keeps it in the page's coordinate space
through scroll and zoom for free.

## 7. Remote Inspect (v3)

The only piece that needs a server.

```
Dev's site (agent.js via <script>)  ──ws──▶  relay  ◀──ws──  phone (dashboard)
```

Same `agent.js`, different transport: instead of the native bridge, it posts over a
WebSocket to a relay keyed by a short session id. The phone scans a QR of that id and
subscribes. Relay is a dumb message forwarder that holds nothing at rest.

This is the shape Eruda and weinre occupy, which is why it's v3 — the native browser
in v1 is the part that doesn't already exist.

## 8. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Kotlin + Jetpack Compose | WebView control needs native. Compose because the UI is lists of text |
| Engine | Android System WebView | Ships on the device, is Chromium, supports the injection this depends on |
| Agent | Vanilla JS, no build step | It's one file that must run before everything else. A bundler buys nothing |
| State | In-memory ring buffer | Sessions are disposable. Room only if v2 export needs persistence |
| Relay (v3) | Node + `ws` on Fly.io | Stateless forwarder, cheapest thing that works |

No React Native. The entire product is WebView lifecycle control and JS injection —
the exact things RN puts a layer between you and.
