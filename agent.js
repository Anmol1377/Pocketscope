// Injected into every page before RN renders results.
// Captures console + fetch/XHR and pipes them to React Native, so the app owns
// the data (needed for export). Every hook calls the original and is try/caught:
// instrumentation must never change how the page behaves.
export default String.raw`
(function () {
  if (window.__ps) return;
  window.__ps = 1;
  var post = function (o) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
  };
  var id = 0;
  var clip = function (s, n) {
    n = n || 20000;
    if (typeof s !== 'string') { try { s = String(s); } catch (e) { return ''; } }
    return s.length > n ? s.slice(0, n) + '\n...[truncated]' : s;
  };
  var show = function (v, depth) {
    depth = depth || 0;
    try {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      var t = typeof v;
      if (t === 'string') return v;
      if (t === 'number' || t === 'boolean') return String(v);
      if (t === 'function') return 'fn ' + (v.name || 'anonymous') + '()';
      if (v instanceof Error) return v.name + ': ' + v.message;
      if (v && v.nodeName) return '<' + v.nodeName.toLowerCase() + '>';
      if (depth > 2) return Array.isArray(v) ? '[Array]' : '{Object}';
      if (Array.isArray(v)) return '[' + v.slice(0, 30).map(function (x) { return show(x, depth + 1); }).join(', ') + (v.length > 30 ? ', ...' : '') + ']';
      var ks = Object.keys(v).slice(0, 30);
      return '{' + ks.map(function (k) { return k + ': ' + show(v[k], depth + 1); }).join(', ') + (Object.keys(v).length > 30 ? ', ...' : '') + '}';
    } catch (e) { return '[unserialisable]'; }
  };

  // ---- console ----
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
    var orig = console[lvl];
    console[lvl] = function () {
      try {
        post({ t: 'log', level: lvl, text: clip(Array.prototype.map.call(arguments, function (a) { return show(a); }).join(' '), 4000) });
      } catch (e) {}
      if (orig) return orig.apply(console, arguments);   // page behaviour never changes
    };
  });
  window.addEventListener('error', function (e) {
    post({ t: 'log', level: 'error', text: (e.message || 'Error') + (e.filename ? '  ' + e.filename.split('/').pop() + ':' + e.lineno : '') });
  });
  window.addEventListener('unhandledrejection', function (e) {
    post({ t: 'log', level: 'error', text: 'Unhandled rejection: ' + show(e.reason) });
  });

  // ---- network ----
  var hdrs = function (h) {
    var o = {};
    try {
      if (!h) return o;
      if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function (v, k) { o[k] = v; });
      else if (Array.isArray(h)) h.forEach(function (p) { o[p[0]] = p[1]; });
      else Object.keys(h).forEach(function (k) { o[k] = h[k]; });
    } catch (e) {}
    return o;
  };
  var of_ = window.fetch;
  if (of_) window.fetch = function (input, init) {
    var n = ++id, t0 = Date.now(), url, method;
    try {
      url = typeof input === 'string' ? input : (input && input.url) || String(input);
      method = (init && init.method) || (input && input.method) || 'GET';
    } catch (e) { url = 'unknown'; method = 'GET'; }
    var req = { t: 'net', n: n, url: url, method: String(method).toUpperCase(), kind: 'fetch',
                reqHeaders: hdrs(init && init.headers), body: clip(init && init.body, 4000) };
    return of_.apply(this, arguments).then(function (res) {
      var done = function (b) {
        req.status = res.status; req.ms = Date.now() - t0;
        req.resHeaders = hdrs(res.headers); req.resBody = clip(b);
        post(req);
      };
      try { res.clone().text().then(done, function () { done(''); }); } catch (e) { done(''); }
      return res;
    }, function (err) {
      req.status = 0; req.ms = Date.now() - t0; req.error = String(err);
      post(req); throw err;
    });
  };
  var XP = window.XMLHttpRequest && XMLHttpRequest.prototype;
  if (XP) {
    var oo = XP.open, os = XP.send, sh = XP.setRequestHeader;
    XP.open = function (m, u) { this.__i = { n: ++id, method: String(m || 'GET').toUpperCase(), url: u, reqHeaders: {} }; return oo.apply(this, arguments); };
    XP.setRequestHeader = function (k, v) { if (this.__i) this.__i.reqHeaders[k] = v; return sh.apply(this, arguments); };
    XP.send = function (b) {
      var self = this, i = this.__i;
      if (i) {
        i.t0 = Date.now(); i.body = clip(b, 4000);
        this.addEventListener('loadend', function () {
          var rt = '';
          try { if (self.responseType === '' || self.responseType === 'text') rt = self.responseText; } catch (e) {}
          var rh = {};
          try {
            (self.getAllResponseHeaders() || '').split('\r\n').filter(Boolean).forEach(function (l) {
              var x = l.split(': '); rh[x[0]] = x.slice(1).join(': ');
            });
          } catch (e) {}
          post({ t: 'net', n: i.n, url: i.url, method: i.method, kind: 'xhr', reqHeaders: i.reqHeaders,
                 body: i.body, status: self.status, ms: Date.now() - i.t0, resHeaders: rh, resBody: clip(rt) });
        });
      }
      return os.apply(this, arguments);
    };
  }

  // ---- console prompt results ----
  // The code itself is injected directly by RN (evaluateJavascript), never eval'd —
  // pages with a strict CSP refuse 'unsafe-eval', which would break the prompt.
  window.__psResult = function (v) {
    if (v && typeof v.then === 'function') {
      post({ t: 'log', level: 'eval', text: '< Promise {pending}' });
      v.then(function (x) { post({ t: 'log', level: 'eval', text: '< ' + show(x) }); },
             function (e) { post({ t: 'log', level: 'error', text: '< ' + String(e) }); });
      return;
    }
    post({ t: 'log', level: 'eval', text: '< ' + show(v) });
  };
  window.__psError = function (m) { post({ t: 'log', level: 'error', text: m }); };

  // ---- performance ----
  window.__psLCP = null; window.__psCLS = 0;
  try {
    new PerformanceObserver(function (l) {
      var e = l.getEntries(); if (e.length) window.__psLCP = Math.round(e[e.length - 1].startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (x) { if (!x.hadRecentInput) window.__psCLS += x.value; });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  window.__psPerf = function () {
    var o = { t: 'perf' };
    try {
      var n = performance.getEntriesByType('navigation')[0];
      if (n) {
        o.dns = Math.round(n.domainLookupEnd - n.domainLookupStart);
        o.tcp = Math.round(n.connectEnd - n.connectStart);
        o.ttfb = Math.round(n.responseStart - n.requestStart);
        o.dcl = Math.round(n.domContentLoadedEventEnd - n.startTime);
        o.load = Math.round(n.loadEventEnd - n.startTime);
        o.docBytes = n.transferSize || 0;
      }
      performance.getEntriesByType('paint').forEach(function (p) {
        if (p.name === 'first-contentful-paint') o.fcp = Math.round(p.startTime);
      });
      var res = performance.getEntriesByType('resource');
      o.resources = res.length;
      o.bytes = res.reduce(function (a, r) { return a + (r.transferSize || 0); }, 0);
      var by = {};
      res.forEach(function (r) { var k = r.initiatorType || 'other'; by[k] = (by[k] || 0) + 1; });
      o.byType = by;
      var slow = res.slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 5);
      o.slowest = slow.map(function (r) {
        return { name: String(r.name).split('/').pop().slice(0, 40) || r.name, ms: Math.round(r.duration) };
      });
      if (performance.memory) o.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
    } catch (e) {}
    o.lcp = window.__psLCP;
    o.cls = Math.round(window.__psCLS * 1000) / 1000;
    post(o);
  };

  // ---- Eruda, on demand only ----
  // Not auto-loaded: its floating entry button sits on top of our toolbar, and the
  // drawer covers the common cases. This is the escape hatch for DOM inspection.
  window.__psEruda = function () {
    if (window.eruda) { try { eruda.show(); } catch (e) {} return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda';
    s.onload = function () { try { eruda.init(); eruda.show(); } catch (e) {} };
    s.onerror = function () { post({ t: 'sys', m: 'eruda blocked by this page' }); };
    (document.head || document.documentElement).appendChild(s);
  };

  // ---- storage, on request from RN ----
  window.__psStorage = function () {
    var dump = function (s) {
      var o = [];
      try { for (var i = 0; i < s.length; i++) { var k = s.key(i); o.push({ k: k, v: clip(s.getItem(k), 2000) }); } } catch (e) {}
      return o;
    };
    post({ t: 'storage',
           local: dump(window.localStorage), session: dump(window.sessionStorage),
           cookies: (document.cookie || '').split('; ').filter(Boolean).map(function (c) {
             var i = c.indexOf('='); return { k: c.slice(0, i), v: c.slice(i + 1) };
           }) });
  };

  post({ t: 'sys', m: 'agent live' });
})();
true;
`;
