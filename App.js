import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, StatusBar,
  BackHandler, Share, Platform, Modal, ScrollView, Linking, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import AGENT from './agent';
import START_HTML from './startpage';
import DevDrawer, { ScopeTrace, toCurl } from './DevDrawer';
import { Tabs, UrlList, Settings, ClearData } from './Screens';
import { usePersistedList } from './store';
import { getItem, setItem, useOptionalFonts, Icon, SafeAreaHost, useInsets } from './native';
import { C, F, S } from './theme';

const START = 'about:start';
const START_BASE = 'https://pocketscope.local/';
const isStart = (u) => !u || u === START || u.startsWith(START_BASE);

const HOMES = {
  pocketscope: { url: START,                     label: 'Pocketscope start page' },
  google:      { url: 'https://www.google.com/', label: 'Google' },
};
const HOME_KEY = 'ps.home', HOME_URL_KEY = 'ps.homeUrl', PRESERVE_KEY = 'ps.preserve', UA_KEY = 'ps.ua';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const normalize = (t) =>
  /^https?:\/\//.test(t) ? t
  : /\.\w{2,}($|\/)/.test(t) ? 'https://' + t
  : 'https://www.google.com/search?q=' + encodeURIComponent(t);

const hostOf = (u) => {
  if (isStart(u)) return 'Pocketscope';
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; }
};

const DOWNLOADABLE = /\.(zip|apk|pdf|dmg|exe|mp4|mp3|csv|xlsx?|docx?|pptx?|tar|gz|7z|iso|deb|rpm)(\?|$)/i;
const blankData = () => ({ reqs: [], logs: [], storage: [], perf: null, element: null, audit: null });

export default function Root() {
  return <SafeAreaHost><App /></SafeAreaHost>;
}

function App() {
  const insets = useInsets();
  const webs = useRef({});          // tab id -> WebView ref
  const seq = useRef(0);            // monotonic React keys; page ids reset per navigation
  const nextTabId = useRef(2);

  useOptionalFonts();

  const [booted, setBooted] = useState(false);
  const [homeKey, setHomeKey] = useState('pocketscope');
  const [preserveLog, setPreserveLog] = useState(false);
  const [desktopUA, setDesktopUA] = useState(false);
  const [customHome, setCustomHome] = useState('');

  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(1);
  const [data, setData] = useState({ 1: blankData() });   // per tab — never mixed between pages

  // One source of truth for the address field. A ref (not state) tracks focus so
  // callbacks never read a stale copy of it.
  const [address, setAddress] = useState('');
  const focused = useRef(false);
  const [drawer, setDrawer] = useState(false);
  const [drawerH, setDrawerH] = useState(320);
  const [screen, setScreen] = useState(null);   // tabs | history | bookmarks | downloads | settings
  const [menu, setMenu] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  const history = usePersistedList('ps.history', 300);
  const bookmarks = usePersistedList('ps.bookmarks', 200);
  const downloads = usePersistedList('ps.downloads', 100);

  const homeUrl = homeKey === 'custom'
    ? (customHome ? normalize(customHome) : START)
    : (HOMES[homeKey] || HOMES.pocketscope).url;

  const tab = tabs.find((t) => t.id === activeId) || tabs[0];
  const web = () => webs.current[activeId];
  const d = data[activeId] || blankData();

  useEffect(() => {
    Promise.all([getItem(HOME_KEY), getItem(HOME_URL_KEY), getItem(PRESERVE_KEY), getItem(UA_KEY)])
      .then(([h, hUrl, p, u]) => {
        const key = HOMES[h] || h === 'custom' ? h : 'pocketscope';
        const custom = hUrl || '';
        setHomeKey(key);
        setCustomHome(custom);
        setPreserveLog(p === '1');
        setDesktopUA(u === '1');
        const first = key === 'custom' && custom ? normalize(custom) : (HOMES[key] || HOMES.pocketscope).url;
        setTabs([{ id: 1, src: first, url: first, title: 'Pocketscope',
                   private: false, canGoBack: false, canGoForward: false, loading: false, progress: 0 }]);
        setBooted(true);
      });
  }, []);

  const patchTab = useCallback((id, patch) =>
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))), []);

  const patchData = useCallback((id, fn) =>
    setData((all) => ({ ...all, [id]: fn(all[id] || blankData()) })), []);

  useEffect(() => {
    if (!focused.current) setAddress(hostOf(tab?.url));
  }, [tab?.url, activeId]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menu) { setMenu(false); return true; }
      if (screen) { setScreen(null); return true; }
      if (drawer) { setDrawer(false); return true; }
      if (tab?.canGoBack) { web()?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab?.canGoBack, drawer, screen, menu, activeId]);

  const onMessage = useCallback((id, e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    const key = ++seq.current;
    if (m.t === 'net')       patchData(id, (s) => ({ ...s, reqs: [...s.reqs.slice(-299), { ...m, key }] }));
    else if (m.t === 'log')  patchData(id, (s) => ({ ...s, logs: [...s.logs.slice(-299), { ...m, key }] }));
    else if (m.t === 'perf') patchData(id, (s) => ({ ...s, perf: m }));
    else if (m.t === 'element') patchData(id, (s) => ({ ...s, element: m }));
    else if (m.t === 'audit') patchData(id, (s) => ({ ...s, audit: m.items }));
    else if (m.t === 'storage') {
      patchData(id, (s) => ({ ...s, storage: [
        ...m.local.map((x) => ({ ...x, scope: 'local' })),
        ...m.session.map((x) => ({ ...x, scope: 'session' })),
        ...m.cookies.map((x) => ({ ...x, scope: 'cookie' })),
      ] }));
    }
  }, [patchData]);

  const go = (text, id = activeId) => {
    const t = String(text).trim();
    const next = t === START ? START : normalize(t);
    patchTab(id, { src: next, url: next });
    focused.current = false;
    setAddress(hostOf(next));
    setScreen(null);
    setMenu(false);
  };

  const newTab = (isPrivate = false, url = homeUrl) => {
    const id = nextTabId.current++;
    setTabs((ts) => [...ts, { id, src: url, url, title: isPrivate ? 'Private tab' : 'New tab',
                              private: isPrivate, canGoBack: false, canGoForward: false,
                              loading: false, progress: 0 }]);
    setData((all) => ({ ...all, [id]: blankData() }));
    setActiveId(id);
    setScreen(null);
    setMenu(false);
  };

  const closeTab = (id) => {
    setTabs((ts) => {
      const left = ts.filter((t) => t.id !== id);
      if (!left.length) {
        const fresh = { id: nextTabId.current++, src: homeUrl, url: homeUrl,
                        title: 'Pocketscope', private: false, canGoBack: false, canGoForward: false,
                        loading: false, progress: 0 };
        setActiveId(fresh.id);
        setData({ [fresh.id]: blankData() });
        return [fresh];
      }
      if (id === activeId) setActiveId(left[left.length - 1].id);
      return left;
    });
    setData((all) => { const n = { ...all }; delete n[id]; return n; });
    delete webs.current[id];
  };

  const clearCaptured = (id = activeId) => patchData(id, () => blankData());

  const setInspect = (on) => {
    setInspecting(on);
    web()?.injectJavaScript('window.__psInspect && window.__psInspect(' + (on ? 'true' : 'false') + '); true;');
  };

  const clearBrowsingData = (picked) => {
    const done = [];
    if (picked.cookies || picked.storage) {
      const js = [
        picked.storage && 'try{localStorage.clear();sessionStorage.clear()}catch(e){}',
        picked.storage && "try{indexedDB.databases&&indexedDB.databases().then(function(l){l.forEach(function(d){indexedDB.deleteDatabase(d.name)})})}catch(e){}",
        picked.cookies && "try{document.cookie.split(';').forEach(function(c){var k=c.split('=')[0].trim();" +
          "['/','']. forEach(function(p){document.cookie=k+'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path='+p})})}catch(e){}",
      ].filter(Boolean).join(';');
      web()?.injectJavaScript(js + '; true;');
      if (picked.cookies) done.push('cookies');
      if (picked.storage) done.push('site storage');
    }
    Object.values(webs.current).forEach((r) => {
      try {
        if (picked.cache) r?.clearCache?.(true);
        if (picked.formData) r?.clearFormData?.();
        if (picked.navHist) r?.clearHistory?.();
      } catch {}
    });
    if (picked.cache) done.push('cache');
    if (picked.formData) done.push('form data');
    if (picked.navHist) done.push('page history');
    if (picked.history) { history.clear(); done.push('history'); }
    if (picked.downloads) { downloads.clear(); done.push('downloads'); }
    if (picked.captured) { setData({ [activeId]: blankData() }); done.push('captured data'); }
    setScreen(null);
    Alert.alert('Cleared', done.join(', ') + '.');
  };

  const evalJs = (code) => {
    const key = ++seq.current;
    patchData(activeId, (s) => ({ ...s, logs: [...s.logs.slice(-299), { level: 'input', text: '> ' + code, key }] }));
    const isStatement = /^\s*(var|let|const|function|class|if|for|while|do|switch|try|throw|return)\b/.test(code);
    const body = isStatement ? code : 'return (' + code + ')';
    web()?.injectJavaScript(
      '(function(){try{window.__psResult((function(){' + body + '})())}' +
      'catch(e){window.__psError(String(e))}})(); true;'
    );
  };

  const shareSession = async () => {
    setMenu(false);
    const body = d.reqs.length
      ? d.reqs.map((r) => `${r.status || 'ERR'}  ${r.method} ${r.url}  ${r.ms}ms\n${toCurl(r)}`).join('\n\n')
      : 'No requests captured.';
    await Share.share({ message: `Pocketscope — ${tab?.url}\n\n${body}` });
  };

  const setPref = (key, value, setter) => { setter(value); setItem(key, value === true ? '1' : value === false ? '0' : value); };

  if (!booted || !tab) {
    return <View style={[s.root, s.boot]}><Text style={s.bootMark}>▚</Text></View>;
  }

  const failed = d.reqs.filter((r) => !r.status || r.status >= 400).length;
  const bookmarked = bookmarks.items.some((b) => b.url === tab.url);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.chassis} />

      <View style={[s.top, tab.private && s.topPrivate]}>
        <View style={s.urlWrap}>
          <Icon
            name={tab.private ? 'eye-off-outline' : isStart(tab.url) ? 'terminal-outline'
                  : tab.url.startsWith('https') ? 'lock-closed' : 'warning'}
            size={12}
            color={tab.private ? C.warn : isStart(tab.url) ? C.trace : tab.url.startsWith('https') ? C.dim : C.warn}
          />
          <TextInput
            style={s.input}
            value={address}
            onFocus={() => { focused.current = true; setAddress(isStart(tab.url) ? '' : tab.url); }}
            onBlur={() => { focused.current = false; setAddress(hostOf(tab.url)); }}
            onChangeText={setAddress}
            onSubmitEditing={(e) => { focused.current = false; go(e.nativeEvent.text); }}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go"
            selectTextOnFocus
            placeholder="Search or enter address"
            placeholderTextColor={C.dim}
            selectionColor={C.trace}
          />
          <Pressable onPress={() => (tab.loading ? web()?.stopLoading() : web()?.reload())} hitSlop={10}>
            <Icon name={tab.loading ? 'close' : 'refresh'} size={15} color={C.dim} />
          </Pressable>
        </View>
        <View style={s.track}>
          {tab.progress > 0 && tab.progress < 1 && (
            <View style={[s.fill, { width: `${tab.progress * 100}%` }]} />
          )}
        </View>
      </View>

      <View style={s.stage}>
        {tabs.map((t) => (
          <View key={t.id} style={[s.page, t.id !== activeId && s.pageHidden]}>
            <WebView
              ref={(r) => { webs.current[t.id] = r; }}
              source={t.src === START ? { html: START_HTML, baseUrl: START_BASE } : { uri: t.src }}
              injectedJavaScriptBeforeContentLoaded={AGENT}
              injectedJavaScript={AGENT}
              onMessage={(e) => onMessage(t.id, e)}
              incognito={t.private}
              userAgent={desktopUA ? DESKTOP_UA : undefined}
              onLoadStart={() => {
                // A new document means the old readings describe a page that is gone.
                if (t.id === activeId && inspecting) setInspecting(false);
                if (!preserveLog) patchData(t.id, () => blankData());
                else patchData(t.id, (x) => ({ ...x, perf: null }));
              }}
              onLoadProgress={(e) => patchTab(t.id, { progress: e.nativeEvent.progress })}
              onNavigationStateChange={(n) => {
                patchTab(t.id, {
                  url: n.url, title: n.title || hostOf(n.url),
                  canGoBack: n.canGoBack, canGoForward: n.canGoForward, loading: n.loading,
                });   // deliberately not src: that would re-issue the load
                if (t.id === activeId && !focused.current) setAddress(hostOf(n.url));
                if (!t.private && !n.loading && !isStart(n.url)) {
                  history.add({ url: n.url, title: n.title || hostOf(n.url) });
                }
              }}
              onShouldStartLoadWithRequest={(r) => {
                if (DOWNLOADABLE.test(r.url)) {
                  // No file-system module on board — hand the URL to Android's own
                  // download manager rather than pulling in a native dependency.
                  downloads.add({ url: r.url, title: r.url.split('/').pop() });
                  Linking.openURL(r.url).catch(() => {});
                  return false;
                }
                return true;
              }}
              originWhitelist={['*']}
              javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled pullToRefreshEnabled
              mixedContentMode="always"
              setSupportMultipleWindows={false}
              style={s.web}
            />
          </View>
        ))}
      </View>

      <ScopeTrace reqs={d.reqs} open={drawer} onPress={() => setDrawer(!drawer)} />

      {drawer && (
        <DevDrawer
          reqs={d.reqs} logs={d.logs} storage={d.storage} perf={d.perf}
          element={d.element} audit={d.audit}
          inspecting={inspecting} onToggleInspect={setInspect}
          onRefreshAudit={() => web()?.injectJavaScript('window.__psAudit && window.__psAudit(); true;')}
          height={drawerH} setHeight={setDrawerH}
          onClose={() => { setDrawer(false); if (inspecting) setInspect(false); }}
          onClear={() => clearCaptured()}
          onRefreshStorage={() => web()?.injectJavaScript('window.__psStorage && window.__psStorage(); true;')}
          onRefreshPerf={() => web()?.injectJavaScript('window.__psPerf && window.__psPerf(); true;')}
          onEval={evalJs}
        />
      )}

      <View style={[s.bottom, { paddingBottom: insets.bottom || S.xs }]}>
        <Nav icon="chevron-back"    disabled={!tab.canGoBack}    onPress={() => web()?.goBack()} />
        <Nav icon="chevron-forward" disabled={!tab.canGoForward} onPress={() => web()?.goForward()} />
        <Nav icon="home-outline"    onPress={() => go(homeUrl)} />
        <Nav icon="copy-outline"    count={tabs.length} onPress={() => setScreen('tabs')} />
        <Nav icon="terminal-outline" active={drawer} badge={failed || null} onPress={() => setDrawer(!drawer)} />
        <Nav icon="ellipsis-horizontal" onPress={() => setMenu(true)} />
      </View>

      {!!screen && (
        <View style={[s.overlay, { paddingBottom: insets.bottom }]}>
      {screen === 'tabs' && (
        <Tabs
          topInset={insets.top}
          tabs={tabs} activeId={activeId}
          onPick={(id) => { setActiveId(id); setScreen(null); }}
          onClose={() => setScreen(null)}
          onCloseTab={closeTab}
          onNew={() => newTab(false)}
          onNewPrivate={() => newTab(true)}
          onCloseAll={() => { tabs.forEach((t) => closeTab(t.id)); setScreen(null); }}
        />
      )}
      {screen === 'history' && (
        <UrlList
          topInset={insets.top}
          title="History" items={history.items} searchable
          empty="Nothing here yet. Pages you visit outside private tabs appear here."
          onClose={() => setScreen(null)} onOpen={(u) => go(u)}
          onRemove={history.remove} onClear={history.clear}
        />
      )}
      {screen === 'bookmarks' && (
        <UrlList
          topInset={insets.top}
          title="Bookmarks" items={bookmarks.items} searchable
          empty="No bookmarks. Add one from the ⋯ menu."
          onClose={() => setScreen(null)} onOpen={(u) => go(u)}
          onRemove={bookmarks.remove} onClear={bookmarks.clear}
        />
      )}
      {screen === 'downloads' && (
        <UrlList
          topInset={insets.top}
          title="Downloads" items={downloads.items}
          empty="No downloads. Files are handed to Android's download manager."
          onClose={() => setScreen(null)} onOpen={(u) => Linking.openURL(u).catch(() => {})}
          onRemove={downloads.remove} onClear={downloads.clear}
        />
      )}
      {screen === 'clear' && (
        <ClearData
          topInset={insets.top}
          onClose={() => setScreen('settings')}
          onClear={clearBrowsingData}
        />
      )}
      {screen === 'settings' && (
        <Settings
          topInset={insets.top}
          homeKey={homeKey} homes={HOMES}
          onPickHome={(k) => {
            setPref(HOME_KEY, k, setHomeKey);
            if (k !== 'custom') go(HOMES[k].url);
            else if (customHome) go(normalize(customHome));
          }}
          customHome={customHome}
          onSetCustomHome={(v) => {
            const clean = String(v).trim();
            setPref(HOME_URL_KEY, clean, setCustomHome);
            if (clean) go(normalize(clean));
          }}
          onClose={() => setScreen(null)}
          onClearData={() => setScreen('clear')}
          onClearCaptured={() => { clearCaptured(); setScreen(null); }}
          preserveLog={preserveLog}
          onTogglePreserve={() => setPref(PRESERVE_KEY, !preserveLog, setPreserveLog)}
          desktopUA={desktopUA}
          onToggleUA={() => { setPref(UA_KEY, !desktopUA, setDesktopUA); setTimeout(() => web()?.reload(), 60); }}
        />
      )}

        </View>
      )}

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={s.scrim} onPress={() => setMenu(false)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + S.md }]} onPress={() => {}}>
            <View style={s.grabber} />
            <ScrollView>
              <MenuItem icon="add" label="New tab" onPress={() => newTab(false)} />
              <MenuItem icon="eye-off-outline" label="New private tab"
                        hint="No cookies or history kept" onPress={() => newTab(true)} />
              <MenuItem
                icon={bookmarked ? 'bookmark' : 'bookmark-outline'}
                label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                onPress={() => {
                  bookmarked ? bookmarks.remove(tab.url)
                             : bookmarks.add({ url: tab.url, title: tab.title });
                  setMenu(false);
                }}
              />
              <MenuItem icon="bookmarks-outline" label="Bookmarks" onPress={() => { setMenu(false); setScreen('bookmarks'); }} />
              <MenuItem icon="time-outline" label="History" onPress={() => { setMenu(false); setScreen('history'); }} />
              <MenuItem icon="download-outline" label="Downloads" onPress={() => { setMenu(false); setScreen('downloads'); }} />
              <MenuItem icon="share-outline" label="Share session"
                        hint="Requests as cURL commands" onPress={shareSession} />
              <MenuItem icon="layers-outline" label="Open Eruda"
                        hint="DOM inspector and full panels"
                        onPress={() => { setMenu(false); web()?.injectJavaScript('window.__psEruda && window.__psEruda(); true;'); }} />
              <MenuItem icon="settings-outline" label="Settings" onPress={() => { setMenu(false); setScreen('settings'); }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuItem({ icon, label, hint, onPress }) {
  return (
    <Pressable onPress={onPress} style={s.menuItem}>
      <Icon name={icon} size={17} color={C.dim} />
      <View style={{ flex: 1 }}>
        <Text style={s.menuLabel}>{label}</Text>
        {!!hint && <Text style={s.menuHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

function Nav({ icon, onPress, disabled, active, badge, count }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={s.nav} hitSlop={4}>
      <Icon name={icon} size={21} color={disabled ? C.edge : active ? C.trace : C.read} />
      {count != null && <Text style={s.count}>{count}</Text>}
      {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.chassis },
  boot: { alignItems: 'center', justifyContent: 'center' },
  bootMark: { color: C.trace, fontSize: 28 },
  top: { backgroundColor: C.chassis },
  topPrivate: { borderBottomWidth: 2, borderBottomColor: C.warn },
  urlWrap: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    marginHorizontal: S.sm, marginTop: S.sm,
    height: 38, borderRadius: 6, backgroundColor: C.raised, paddingHorizontal: S.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge,
  },
  input: { flex: 1, color: C.read, fontFamily: F.mono, fontSize: 13, padding: 0 },
  track: { height: 2, marginTop: S.sm },
  fill: { height: 2, backgroundColor: C.trace },
  stage: { flex: 1 },
  page: { flex: 1 },
  pageHidden: { display: 'none' },   // keeps the tab mounted, so its state survives a switch
  web: { flex: 1, backgroundColor: '#fff' },
  bottom: {
    flexDirection: 'row', alignItems: 'center', paddingTop: S.sm, backgroundColor: C.chassis,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge,
  },
  nav: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 36 },
  count: {
    position: 'absolute', fontFamily: F.monoMed, fontSize: 9, color: C.read,
    top: 11, alignSelf: 'center',
  },
  badge: {
    position: 'absolute', top: 0, right: '24%',
    minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: C.fail, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: F.monoMed, fontSize: 9, color: C.well },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.well, zIndex: 20,
  },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '75%', backgroundColor: C.chassis, paddingTop: S.sm,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge,
  },
  grabber: { width: 34, height: 3, borderRadius: 2, backgroundColor: C.edge, alignSelf: 'center', marginBottom: S.sm },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: S.md,
    paddingHorizontal: S.lg, paddingVertical: 13,
  },
  menuLabel: { fontFamily: F.sansMed, fontSize: 14, color: C.read },
  menuHint: { fontFamily: F.sans, fontSize: 11, color: C.dim, marginTop: 2 },
});
