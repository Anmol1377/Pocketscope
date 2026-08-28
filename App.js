import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, StatusBar,
  BackHandler, Share, Platform, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { getItem, setItem, useOptionalFonts, Icon, SafeAreaHost, useInsets } from './native';
import AGENT from './agent';
import START_HTML from './startpage';
import DevDrawer, { ScopeTrace, toCurl } from './DevDrawer';
import { C, F, S } from './theme';

const START = 'about:start';        // the bundled start page, works offline
const START_BASE = 'https://pocketscope.local/';   // only a baseUrl for relative links
const isStart = (u) => !u || u === START || u.startsWith(START_BASE);
const HOMES = {
  pocketscope: { url: START,                     label: 'Pocketscope start page' },
  google:      { url: 'https://www.google.com/', label: 'Google' },
};
const HOME_KEY = 'ps.home';

const normalize = (t) =>
  /^https?:\/\//.test(t) ? t
  : /\.\w{2,}($|\/)/.test(t) ? 'https://' + t
  : 'https://www.google.com/search?q=' + encodeURIComponent(t);

const hostOf = (u) => {
  if (isStart(u)) return 'Pocketscope';
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; }
};

export default function Root() {
  return <SafeAreaHost><App /></SafeAreaHost>;
}

function App() {
  const insets = useInsets();
  const web = useRef(null);
  const seq = useRef(0);   // page-local ids reset on navigation; React keys must not

  useOptionalFonts();   // cosmetic — the UI renders with or without them

  const [homeKey, setHomeKey] = useState('pocketscope');
  const [booted, setBooted] = useState(false);
  const [url, setUrl] = useState(null);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [nav, setNav] = useState({ url: '', canGoBack: false, canGoForward: false, loading: false });
  const [progress, setProgress] = useState(0);

  const [reqs, setReqs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [storage, setStorage] = useState([]);
  const [perf, setPerf] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerH, setDrawerH] = useState(300);
  const [settings, setSettings] = useState(false);

  // Restore the chosen start page before the first load, so it isn't overwritten.
  useEffect(() => {
    getItem(HOME_KEY).then((k) => {
      const key = HOMES[k] ? k : 'pocketscope';
      setHomeKey(key);
      setUrl(HOMES[key].url);
      setBooted(true);
    });
  }, []);

  const chooseHome = async (key) => {
    setHomeKey(key);
    await setItem(HOME_KEY, key);
    setSettings(false);
    go(HOMES[key].url);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawer) { setDrawer(false); return true; }
      if (nav.canGoBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [nav.canGoBack, drawer]);

  const onMessage = useCallback((e) => {
    let m; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    const key = ++seq.current;   // computed outside the updater — updaters must stay pure
    if (m.t === 'net') setReqs((r) => [...r.slice(-299), { ...m, key }]);
    else if (m.t === 'log') setLogs((l) => [...l.slice(-299), { ...m, key }]);
    else if (m.t === 'perf') setPerf(m);
    else if (m.t === 'storage') {
      setStorage([
        ...m.local.map((x) => ({ ...x, scope: 'local' })),
        ...m.session.map((x) => ({ ...x, scope: 'session' })),
        ...m.cookies.map((x) => ({ ...x, scope: 'cookie' })),
      ]);
    }
  }, []);

  const go = (text) => {
    const t = String(text).trim();
    setUrl(t === START ? START : normalize(t));   // the sentinel is not a searchable string
    setEditing(false);
    setPerf(null);
  };
  const refreshStorage = () => web.current?.injectJavaScript('window.__psStorage && window.__psStorage(); true;');
  const refreshPerf = () => web.current?.injectJavaScript('window.__psPerf && window.__psPerf(); true;');
  const evalJs = (code) => {
    setLogs((l) => [...l.slice(-299), { t: 'log', level: 'input', text: '> ' + code, key: ++seq.current }]);
    // Inject the source directly instead of eval()-ing a string: strict-CSP pages
    // ('unsafe-eval' not allowed) reject eval, and most real sites set one.
    const isStatement = /^\s*(var|let|const|function|class|if|for|while|do|switch|try|throw|return)\b/.test(code);
    const body = isStatement ? code : 'return (' + code + ')';
    web.current?.injectJavaScript(
      '(function(){try{window.__psResult((function(){' + body + '})())}' +
      'catch(e){window.__psError(String(e))}})(); true;'
    );
  };
  const openEruda = () =>
    web.current?.injectJavaScript('window.__psEruda && window.__psEruda(); true;');

  const shareSession = async () => {
    const body = reqs.length
      ? reqs.map((r) => `${r.status || 'ERR'}  ${r.method} ${r.url}  ${r.ms}ms\n${toCurl(r)}`).join('\n\n')
      : 'No requests captured.';
    await Share.share({ message: `Pocketscope — ${nav.url}\n\n${body}` });
  };

  if (!booted) {
    return <View style={[s.root, s.boot]}><Text style={s.bootMark}>▚</Text></View>;
  }

  const failed = reqs.filter((r) => !r.status || r.status >= 400).length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.chassis} />

      <View style={s.top}>
        <View style={s.urlWrap}>
          <Icon
            name={isStart(nav.url) ? 'terminal-outline' : nav.url.startsWith('https') ? 'lock-closed' : 'warning'}
            size={11}
            color={isStart(nav.url) ? C.trace : nav.url.startsWith('https') ? C.dim : C.warn}
          />
          <TextInput
            style={s.input}
            value={editing ? input : hostOf(nav.url || url)}
            onFocus={() => { setEditing(true); setInput(nav.url || url); }}
            onBlur={() => setEditing(false)}
            onChangeText={setInput}
            onSubmitEditing={(e) => go(e.nativeEvent.text)}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go"
            selectTextOnFocus
            placeholder="Search or enter address"
            placeholderTextColor={C.dim}
            selectionColor={C.trace}
          />
          <Pressable
            onPress={() => (nav.loading ? web.current?.stopLoading() : web.current?.reload())}
            hitSlop={10}>
            <Icon name={nav.loading ? 'close' : 'refresh'} size={15} color={C.dim} />
          </Pressable>
        </View>
        <View style={s.track}>
          {progress > 0 && progress < 1 && <View style={[s.fill, { width: `${progress * 100}%` }]} />}
        </View>
      </View>

      <WebView
        ref={web}
        source={url === START ? { html: START_HTML, baseUrl: START_BASE } : { uri: url }}
        injectedJavaScriptBeforeContentLoaded={AGENT}
        injectedJavaScript={AGENT}
        onMessage={onMessage}
        onLoadProgress={(e) => setProgress(e.nativeEvent.progress)}
        onNavigationStateChange={(n) => {
          setNav({ url: n.url, canGoBack: n.canGoBack, canGoForward: n.canGoForward, loading: n.loading });
          if (!editing) setInput(isStart(n.url) ? '' : n.url);
        }}
        originWhitelist={['*']}
        javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled pullToRefreshEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        style={s.web}
      />

      <ScopeTrace reqs={reqs} open={drawer} onPress={() => setDrawer(!drawer)} />

      {drawer && (
        <DevDrawer
          reqs={reqs} logs={logs} storage={storage} perf={perf}
          height={drawerH} setHeight={setDrawerH}
          onClose={() => setDrawer(false)}
          onRefreshStorage={refreshStorage}
          onRefreshPerf={refreshPerf}
          onEval={evalJs}
        />
      )}

      <View style={[s.bottom, { paddingBottom: insets.bottom || S.xs }]}>
        <Nav icon="chevron-back"    disabled={!nav.canGoBack}    onPress={() => web.current?.goBack()} />
        <Nav icon="chevron-forward" disabled={!nav.canGoForward} onPress={() => web.current?.goForward()} />
        <Nav icon="home-outline"    onPress={() => go(HOMES[homeKey].url)} />
        <Nav icon="terminal-outline" active={drawer} badge={failed || null} onPress={() => setDrawer(!drawer)} />
        <Nav icon="share-outline"   onPress={shareSession} onLongPress={openEruda} />
        <Nav icon="ellipsis-horizontal" onPress={() => setSettings(true)} />
      </View>

      <Modal visible={settings} transparent animationType="fade" onRequestClose={() => setSettings(false)}>
        <Pressable style={s.scrim} onPress={() => setSettings(false)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + S.lg }]} onPress={() => {}}>
            <Text style={s.sheetTitle}>START PAGE</Text>
            {Object.entries(HOMES).map(([key, h]) => (
              <Pressable key={key} onPress={() => chooseHome(key)} style={s.opt}>
                <Icon
                  name={homeKey === key ? 'radio-button-on' : 'radio-button-off'}
                  size={17} color={homeKey === key ? C.trace : C.dim}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.optLabel}>{h.label}</Text>
                  <Text style={s.optUrl}>{hostOf(h.url)}</Text>
                </View>
              </Pressable>
            ))}
            <Text style={s.sheetTitle}>SESSION</Text>
            <Pressable onPress={() => { setReqs([]); setLogs([]); setStorage([]); setSettings(false); }} style={s.opt}>
              <Icon name="trash-outline" size={16} color={C.dim} />
              <Text style={s.optLabel}>Clear captured data</Text>
            </Pressable>
            <Pressable onPress={() => { setSettings(false); openEruda(); }} style={s.opt}>
              <Icon name="layers-outline" size={16} color={C.dim} />
              <View style={{ flex: 1 }}>
                <Text style={s.optLabel}>Open Eruda</Text>
                <Text style={s.optUrl}>DOM inspector and full panels</Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Nav({ icon, onPress, onLongPress, disabled, active, badge }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} style={s.nav} hitSlop={4}>
      <Icon name={icon} size={21} color={disabled ? C.edge : active ? C.trace : C.read} />
      {badge ? (
        <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.chassis },
  boot: { alignItems: 'center', justifyContent: 'center' },
  bootMark: { color: C.trace, fontSize: 28 },
  top: { backgroundColor: C.chassis },
  urlWrap: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    marginHorizontal: S.sm, marginTop: S.sm,
    height: 38, borderRadius: 6, backgroundColor: C.raised, paddingHorizontal: S.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge,
  },
  input: { flex: 1, color: C.read, fontFamily: F.mono, fontSize: 13, padding: 0 },
  track: { height: 2, marginTop: S.sm },
  fill: { height: 2, backgroundColor: C.trace },
  web: { flex: 1, backgroundColor: '#fff' },
  bottom: {
    flexDirection: 'row', alignItems: 'center', paddingTop: S.sm,
    backgroundColor: C.chassis,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge,
  },
  nav: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 36 },
  badge: {
    position: 'absolute', top: 0, right: '26%',
    minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: C.fail, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: F.monoMed, fontSize: 9, color: C.well },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.chassis, paddingHorizontal: S.lg, paddingTop: S.lg,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge,
  },
  sheetTitle: {
    fontFamily: F.sansMed, fontSize: 9, letterSpacing: 1.2, color: C.dim,
    marginTop: S.md, marginBottom: S.sm,
  },
  opt: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md },
  optLabel: { fontFamily: F.sansMed, fontSize: 14, color: C.read },
  optUrl: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 2 },
});
