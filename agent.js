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
  // Kept so Eruda, which only captures from its own init, can be back-filled when
  // opened. Text not references: holding page objects would leak.
  var backlog = [];
  var remember = function (level, text) {
    backlog.push({ level: level, text: text });
    if (backlog.length > 200) backlog.shift();
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (lvl) {
    var orig = console[lvl];
    console[lvl] = function () {
      try {
        var text = clip(Array.prototype.map.call(arguments, function (a) { return show(a); }).join(' '), 4000);
        remember(lvl, text);
        post({ t: 'log', level: lvl, text: text });
      } catch (e) {}
      if (orig) return orig.apply(console, arguments);   // page behaviour never changes
    };
  });
  window.addEventListener('error', function (e) {
    var t = (e.message || 'Error') + (e.filename ? '  ' + e.filename.split('/').pop() + ':' + e.lineno : '');
    remember('error', t);
    post({ t: 'log', level: 'error', text: t });
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

  // ---- tap to inspect ----
  // The mobile answer to an Elements panel: touch highlights, tap reports.
  var sel = function (el) {
    if (!el || !el.tagName) return '';
    if (el.id) return '#' + el.id;
    var out = el.tagName.toLowerCase();
    var c = el.getAttribute && el.getAttribute('class');
    if (c) out += '.' + String(c).trim().split(/\s+/).slice(0, 3).join('.');
    return out;
  };
  // Node registry for the tree. Rebuilt per document, so ids stay valid only for
  // the current page — which is all the RN side ever asks about.
  var nodes = [];
  var boxFor = null;
  var highlight = function (el) {
    if (!boxFor) {
      boxFor = document.createElement('div');
      boxFor.setAttribute('data-pocketscope', '1');
      boxFor.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;' +
        'border:2px solid #5AA9E6;background:rgba(90,169,230,.14);border-radius:2px;';
      (document.body || document.documentElement).appendChild(boxFor);
    }
    var r = el.getBoundingClientRect();
    boxFor.style.top = r.top + 'px'; boxFor.style.left = r.left + 'px';
    boxFor.style.width = r.width + 'px'; boxFor.style.height = r.height + 'px';
  };

  var report = function (el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var keys = ['display', 'position', 'width', 'height', 'margin', 'padding',
                'border', 'font-family', 'font-size', 'line-height', 'color',
                'background-color', 'flex', 'grid-template-columns', 'z-index', 'overflow'];
    var styles = {};
    keys.forEach(function (k) { var v = cs.getPropertyValue(k); if (v) styles[k] = v; });
    var chain = [], node = el, n = 0;
    while (node && node.nodeType === 1 && n++ < 6) { chain.unshift(sel(node)); node = node.parentElement; }
    post({ t: 'element', tag: el.tagName.toLowerCase(), sel: sel(el), path: chain.join(' > '),
           rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
           styles: styles, html: clip(el.outerHTML, 3000),
           text: clip((el.textContent || '').trim(), 200) });
  };

  // ---- DOM tree, walked one level at a time ----
  var info = function (el) {
    var id = nodes.push(el) - 1;
    var kids = el.children ? el.children.length : 0;
    return {
      id: id,
      tag: el.tagName ? el.tagName.toLowerCase() : '?',
      elId: el.id || '',
      cls: (el.getAttribute && el.getAttribute('class')) || '',
      kids: kids,
      text: kids ? '' : clip((el.textContent || '').trim().replace(/\s+/g, ' '), 60),
    };
  };
  window.__psTree = function (parentId) {
    var out = [];
    if (parentId === null || parentId === undefined) {
      nodes = [];
      out.push(info(document.documentElement));
    } else {
      var el = nodes[parentId];
      if (!el) return;
      for (var i = 0; i < el.children.length; i++) {
        if (el.children[i].getAttribute('data-pocketscope')) continue;   // never show our own overlay
        out.push(info(el.children[i]));
      }
    }
    post({ t: 'tree', parent: parentId === undefined ? null : parentId, nodes: out });
  };
  window.__psTreePick = function (id) {
    var el = nodes[id];
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    highlight(el);
    report(el);
  };

  window.__psInspect = function (on) {
    if (!on) { if (window.__psOffInspect) window.__psOffInspect(); return; }
    if (window.__psOffInspect) return;
    var box = document.createElement('div');
    box.setAttribute('data-pocketscope', '1');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;' +
      'border:2px solid #5AA9E6;background:rgba(90,169,230,.14);border-radius:2px;';
    (document.body || document.documentElement).appendChild(box);

    var draw = function (el) {
      var r = el.getBoundingClientRect();
      box.style.top = r.top + 'px'; box.style.left = r.left + 'px';
      box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    };
    var over = function (e) { if (e.target && e.target !== box) draw(e.target); };
    var pick = function (e) {
      var el = e.target;
      if (!el || el === box || el.getAttribute('data-pocketscope')) return;
      e.preventDefault(); e.stopPropagation();
      draw(el);
      report(el);
    };
    document.addEventListener('touchstart', over, true);
    document.addEventListener('click', pick, true);
    window.__psOffInspect = function () {
      document.removeEventListener('touchstart', over, true);
      document.removeEventListener('click', pick, true);
      if (box.parentNode) box.parentNode.removeChild(box);
      window.__psOffInspect = null;
    };
  };

  // ---- page audit ----
  // Checks that actually bite on mobile, not a generic lint.
  window.__psAudit = function () {
    var out = [];
    var add = function (level, title, detail) { out.push({ level: level, title: title, detail: detail }); };
    try {
      var vp = document.querySelector('meta[name="viewport"]');
      if (!vp) add('fail', 'No viewport meta tag', 'The page will render at desktop width and be zoomed out.');
      else if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(vp.content))
        add('warn', 'Zoom is disabled', 'user-scalable=no blocks people who need to magnify text.');

      if (location.protocol === 'https:') {
        var mixed = [].slice.call(document.querySelectorAll('[src^="http:"],[href^="http:"]'));
        if (mixed.length) add('fail', mixed.length + ' mixed-content references',
          'http:// resources on an https:// page are blocked or downgrade security.');
      }
      if (!document.title) add('warn', 'No page title', 'Bad for tabs, history and search results.');
      var desc = document.querySelector('meta[name="description"]');
      if (!desc || !desc.content) add('warn', 'No meta description', 'Search engines will invent one.');

      var imgs = [].slice.call(document.images);
      var noAlt = imgs.filter(function (i) { return !i.hasAttribute('alt'); });
      if (noAlt.length) add('warn', noAlt.length + ' of ' + imgs.length + ' images lack alt text',
        'Screen readers announce the filename instead.');
      var huge = imgs.filter(function (i) {
        return i.naturalWidth > i.clientWidth * 2 && i.clientWidth > 0;
      });
      if (huge.length) add('warn', huge.length + ' oversized images',
        'Served at more than twice their displayed width — wasted bytes on mobile.');

      var lazy = imgs.filter(function (i) { return i.loading === 'lazy'; }).length;
      if (imgs.length > 5 && lazy === 0) add('info', 'No lazy-loaded images',
        imgs.length + ' images all load eagerly. loading="lazy" would defer the offscreen ones.');

      var wide = document.documentElement.scrollWidth > window.innerWidth + 2;
      if (wide) add('fail', 'Page scrolls sideways',
        'Content is ' + document.documentElement.scrollWidth + 'px wide in a ' + window.innerWidth + 'px viewport.');

      var small = [].slice.call(document.querySelectorAll('a,button,input,select'))
        .filter(function (el) { var r = el.getBoundingClientRect(); return r.width && r.height && (r.width < 44 || r.height < 44); });
      if (small.length) add('warn', small.length + ' tap targets under 44px',
        'Below the size most guidelines call reliably tappable.');

      var inline = document.querySelectorAll('script:not([src])').length;
      if (inline > 10) add('info', inline + ' inline scripts', 'Each one blocks parsing where it sits.');
      if (!document.querySelector('html[lang]')) add('warn', 'No lang attribute on <html>',
        'Screen readers cannot pick the right pronunciation.');
    } catch (e) {}
    if (!out.length) add('pass', 'Nothing flagged', 'The checks Pocketscope runs all passed on this page.');
    post({ t: 'audit', items: out });
  };

  // ---- Eruda, on demand only ----
  // Not auto-loaded: its floating entry button sits on top of our toolbar, and the
  // drawer covers the common cases. This is the escape hatch for DOM inspection.
  window.__psEruda = function () {
    if (window.eruda) { try { eruda.show(); } catch (e) {} return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/eruda';
    s.onload = function () {
      try {
        eruda.init({ defaults: { theme: 'Dark', displaySize: 55, transparency: 1 } });
        // Eruda captures only from its own init; replay what the page logged before.
        try {
          var c = eruda.get('console');
          if (c) {
            c.log('%c-- ' + backlog.length + ' earlier console entries, replayed by Pocketscope --', 'color:#5AA9E6');
            backlog.forEach(function (e) {
              (typeof c[e.level] === 'function' ? c[e.level] : c.log).call(c, e.text);
            });
          }
        } catch (e) {}
        eruda.show();
      } catch (e) {}
    };
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
