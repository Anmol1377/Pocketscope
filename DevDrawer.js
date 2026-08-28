import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, PanResponder, Dimensions, TextInput,
} from 'react-native';
import { copy as copyText, Icon } from './native';
import { C, F, S, statusColor } from './theme';

// Core Web Vitals thresholds (good, poor). Between them = needs work.
const LIMITS = {
  lcp:  [2500, 4000], fcp: [1800, 3000], ttfb: [800, 1800],
  cls:  [0.1, 0.25],  dcl: [2000, 4000], load: [3000, 6000],
};
const rate = (k, v) => {
  const l = LIMITS[k];
  if (!l || v == null) return C.read;
  return v <= l[0] ? C.live : v <= l[1] ? C.warn : C.fail;
};
const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

const TABS = ['Network', 'Console', 'Storage', 'Perf'];
const SCREEN = Dimensions.get('window').height;
const MIN_H = 180;

// Middle-truncate: the end of a URL carries more information than the middle.
const shortPath = (u) => {
  try {
    const { pathname, search, host } = new URL(u);
    const p = (pathname + search) || '/';
    return { host, path: p.length > 38 ? p.slice(0, 18) + '…' + p.slice(-18) : p };
  } catch { return { host: '', path: u }; }
};

export const toCurl = (r) => [
  `curl -X ${r.method} '${r.url}'`,
  ...Object.entries(r.reqHeaders || {}).map(([k, v]) => `  -H '${k}: ${v}'`),
  r.body ? `  --data '${String(r.body).replace(/'/g, `'\\''`)}'` : null,
].filter(Boolean).join(' \\\n');

/* ── Signature: a live scope trace. Each request is a tick; height is duration,
      colour is status class. Doubles as the drawer handle. ───────────────── */
export function ScopeTrace({ reqs, open, onPress }) {
  const ticks = reqs.slice(-64);
  const max = Math.max(120, ...ticks.map((r) => r.ms || 0));
  const failed = reqs.filter((r) => !r.status || r.status >= 400).length;

  return (
    <Pressable onPress={onPress} style={t.wrap}>
      <View style={t.trace}>
        {ticks.length === 0 ? (
          <Text style={t.idle}>no signal — load a page</Text>
        ) : (
          ticks.map((r, i) => (
            <View
              key={r.key ?? i}
              style={{
                width: 3, marginRight: 1, borderRadius: 1,
                height: Math.max(2, ((r.ms || 0) / max) * 18),
                backgroundColor: statusColor(r.status),
                opacity: 0.55 + 0.45 * (i / Math.max(1, ticks.length - 1)),
              }}
            />
          ))
        )}
      </View>
      <View style={t.counts}>
        <Text style={t.count}>{reqs.length}</Text>
        {failed > 0 && <Text style={[t.count, { color: C.fail }]}>{failed} failed</Text>}
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={13} color={C.dim} />
      </View>
    </Pressable>
  );
}

export default function DevDrawer({ reqs, logs, storage, perf, height, setHeight, onClose, onRefreshStorage, onRefreshPerf, onEval }) {
  const [tab, setTab] = useState('Network');
  const [sel, setSel] = useState(null);
  const start = useRef(height);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => { start.current = height; },
    onPanResponderMove: (_, g) =>
      setHeight(Math.min(SCREEN * 0.8, Math.max(MIN_H, start.current - g.dy))),
  }), [height, setHeight]);

  const copy = copyText;

  return (
    <View style={[d.root, { height }]}>
      <View {...pan.panHandlers} style={d.grip}><View style={d.gripBar} /></View>

      <View style={d.tabs}>
        {TABS.map((x) => (
          <Pressable
            key={x}
            onPress={() => {
              setSel(null); setTab(x);
              if (x === 'Storage') onRefreshStorage();
              if (x === 'Perf') onRefreshPerf();
            }}
            style={[d.tab, tab === x && d.tabOn]}>
            <Text style={[d.tabText, tab === x && d.tabTextOn]}>{x.toUpperCase()}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onClose} style={d.close} hitSlop={8}>
          <Icon name="close" size={17} color={C.dim} />
        </Pressable>
      </View>

      {sel ? (
        <Detail req={sel} onBack={() => setSel(null)} onCopy={copy} />
      ) : tab === 'Network' ? (
        <List
          follow
          data={reqs}
          empty="No requests yet. Load a page."
          render={(r) => {
            const { path } = shortPath(r.url);
            return (
              <Pressable key={r.key} onPress={() => setSel(r)} style={d.row}>
                <View style={[d.rail, { backgroundColor: statusColor(r.status) }]} />
                <Text style={[d.status, { color: statusColor(r.status) }]}>{r.status || 'ERR'}</Text>
                <Text style={d.method}>{r.method}</Text>
                <Text style={d.path} numberOfLines={1}>{path}</Text>
                <Text style={d.ms}>{r.ms}ms</Text>
              </Pressable>
            );
          }}
        />
      ) : tab === 'Console' ? (
        <>
          <List
            follow
            data={logs}
            empty="No console output yet. Run an expression below."
            render={(l, i) => (
              <View key={l.key ?? i} style={d.row}>
                <View style={[d.rail, {
                  backgroundColor: l.level === 'error' ? C.fail : l.level === 'warn' ? C.warn
                    : l.level === 'eval' ? C.trace : l.level === 'input' ? C.dim : C.edge,
                }]} />
                <Text
                  style={[d.log,
                    l.level === 'error' && { color: C.fail },
                    l.level === 'warn' && { color: C.warn },
                    l.level === 'eval' && { color: C.trace },
                    l.level === 'input' && { color: C.dim }]}
                  selectable>
                  {l.text}
                </Text>
              </View>
            )}
          />
          <Prompt onRun={onEval} />
        </>
      ) : tab === 'Perf' ? (
        <Perf perf={perf} onRefresh={onRefreshPerf} />
      ) : (
        <List
          data={storage}
          empty="Tap Storage again to read this page."
          render={(kv, i) => (
            <Pressable key={i} onLongPress={() => copy(kv.v)} style={d.row}>
              <View style={[d.rail, { backgroundColor: C.trace }]} />
              <Text style={d.kvScope}>{kv.scope}</Text>
              <Text style={d.kvKey} numberOfLines={1}>{kv.k}</Text>
              <Text style={d.kvVal} numberOfLines={1}>{kv.v}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Prompt({ onRun }) {
  const [code, setCode] = useState('');
  const run = () => {
    const c = code.trim();
    if (!c) return;
    onRun(c);
    setCode('');
  };
  return (
    <View style={d.prompt}>
      <Text style={d.caret}>&gt;</Text>
      <TextInput
        style={d.promptInput}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={run}
        placeholder="document.title"
        placeholderTextColor={C.dim}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="go"
        blurOnSubmit={false}
        selectionColor={C.trace}
        multiline={false}
      />
      <Pressable onPress={run} style={d.runBtn} hitSlop={6}>
        <Text style={d.runText}>Run</Text>
      </Pressable>
    </View>
  );
}

function Perf({ perf, onRefresh }) {
  if (!perf) {
    return (
      <View style={d.emptyWrap}>
        <Text style={d.empty}>Reading page timing…</Text>
        <Pressable onPress={onRefresh} style={d.reread}><Text style={d.rereadText}>Read again</Text></Pressable>
      </View>
    );
  }
  const Metric = ({ k, label, value, unit = 'ms' }) => (
    <View style={d.metric}>
      <View style={[d.rail, { backgroundColor: rate(k, value) }]} />
      <Text style={d.metricLabel}>{label}</Text>
      <Text style={[d.metricValue, { color: rate(k, value) }]}>
        {value == null ? '—' : value + (unit ? ' ' + unit : '')}
      </Text>
    </View>
  );
  return (
    <ScrollView style={d.list} contentContainerStyle={{ paddingBottom: S.xl }}>
      <Text style={d.section}>CORE WEB VITALS</Text>
      <Metric k="lcp" label="Largest contentful paint" value={perf.lcp} />
      <Metric k="cls" label="Cumulative layout shift" value={perf.cls} unit="" />
      <Metric k="fcp" label="First contentful paint" value={perf.fcp} />

      <Text style={d.section}>LOAD</Text>
      <Metric k="ttfb" label="Time to first byte" value={perf.ttfb} />
      <Metric k="dcl" label="DOM content loaded" value={perf.dcl} />
      <Metric k="load" label="Load complete" value={perf.load} />
      <Metric k="dns" label="DNS lookup" value={perf.dns} />
      <Metric k="tcp" label="TCP connect" value={perf.tcp} />

      <Text style={d.section}>WEIGHT</Text>
      <Metric k="n" label="Resources" value={perf.resources} unit="" />
      <View style={d.metric}>
        <View style={[d.rail, { backgroundColor: C.edge }]} />
        <Text style={d.metricLabel}>Transferred</Text>
        <Text style={d.metricValue}>{perf.bytes != null ? fmtBytes(perf.bytes) : '—'}</Text>
      </View>
      {perf.heapMB != null && <Metric k="n" label="JS heap used" value={perf.heapMB} unit="MB" />}

      {!!perf.byType && (
        <>
          <Text style={d.section}>BY TYPE</Text>
          {Object.entries(perf.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <View key={k} style={d.metric}>
              <View style={[d.rail, { backgroundColor: C.edge }]} />
              <Text style={d.metricLabel}>{k}</Text>
              <Text style={d.metricValue}>{v}</Text>
            </View>
          ))}
        </>
      )}

      {!!(perf.slowest || []).length && (
        <>
          <Text style={d.section}>SLOWEST RESOURCES</Text>
          {perf.slowest.map((r, i) => (
            <View key={i} style={d.metric}>
              <View style={[d.rail, { backgroundColor: r.ms > 1000 ? C.fail : r.ms > 400 ? C.warn : C.live }]} />
              <Text style={d.metricLabel} numberOfLines={1}>{r.name}</Text>
              <Text style={d.metricValue}>{r.ms} ms</Text>
            </View>
          ))}
        </>
      )}

      <Pressable onPress={onRefresh} style={d.reread}><Text style={d.rereadText}>Read again</Text></Pressable>
    </ScrollView>
  );
}

function List({ data, render, empty, follow }) {
  const ref = useRef(null);
  const pinned = useRef(true);   // stop following once the user scrolls up to read

  useEffect(() => {
    if (follow && pinned.current) ref.current?.scrollToEnd({ animated: false });
  }, [data.length, follow]);

  if (!data.length) return <View style={d.emptyWrap}><Text style={d.empty}>{empty}</Text></View>;
  return (
    <ScrollView
      ref={ref}
      style={d.list}
      contentContainerStyle={{ paddingBottom: S.lg }}
      onScroll={(e) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        pinned.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
      }}
      scrollEventThrottle={16}>
      {data.map(render)}
    </ScrollView>
  );
}

function Detail({ req, onBack, onCopy }) {
  const Section = ({ title, children }) => (
    <>
      <Text style={d.section}>{title}</Text>
      {children}
    </>
  );
  const kv = (o) =>
    Object.entries(o || {}).map(([k, v]) => (
      <Text key={k} style={d.detailLine} selectable>
        <Text style={{ color: C.dim }}>{k}: </Text>{String(v)}
      </Text>
    ));

  return (
    <View style={{ flex: 1 }}>
      <View style={d.detailBar}>
        <Pressable onPress={onBack} hitSlop={8} style={d.backBtn}>
          <Icon name="chevron-back" size={16} color={C.read} />
          <Text style={d.backText}>Back</Text>
        </Pressable>
        <Pressable onPress={() => onCopy(toCurl(req))} style={d.curlBtn}>
          <Icon name="copy-outline" size={13} color={C.well} />
          <Text style={d.curlText}>Copy as cURL</Text>
        </Pressable>
      </View>
      <ScrollView style={d.list} contentContainerStyle={{ padding: S.md, paddingBottom: S.xl }}>
        <Text style={[d.status, { color: statusColor(req.status), fontSize: 16 }]}>
          {req.status || 'ERR'}  <Text style={{ color: C.read }}>{req.method}</Text>
          <Text style={{ color: C.dim }}>  {req.ms}ms</Text>
        </Text>
        <Text style={d.detailUrl} selectable>{req.url}</Text>
        <Section title="REQUEST HEADERS">{kv(req.reqHeaders)}</Section>
        {!!req.body && <Section title="REQUEST BODY"><Text style={d.detailLine} selectable>{req.body}</Text></Section>}
        <Section title="RESPONSE HEADERS">{kv(req.resHeaders)}</Section>
        <Section title="RESPONSE BODY">
          <Text style={d.detailLine} selectable>{pretty(req.resBody) || '(empty)'}</Text>
        </Section>
      </ScrollView>
    </View>
  );
}

const pretty = (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };

const t = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', height: 30,
    paddingHorizontal: S.md, backgroundColor: C.chassis,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge,
  },
  trace: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: 20 },
  idle: { fontFamily: F.mono, fontSize: 10, color: C.dim, alignSelf: 'center' },
  counts: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginLeft: S.sm },
  count: { fontFamily: F.monoMed, fontSize: 10, color: C.dim },
});

const d = StyleSheet.create({
  root: { backgroundColor: C.well, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge },
  grip: { height: 16, alignItems: 'center', justifyContent: 'center' },
  gripBar: { width: 34, height: 3, borderRadius: 2, backgroundColor: C.edge },
  tabs: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.edge,
  },
  tab: { paddingHorizontal: S.md, paddingVertical: S.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: C.trace },
  tabText: { fontFamily: F.sansMed, fontSize: 10, letterSpacing: 1.1, color: C.dim },
  tabTextOn: { color: C.read },
  close: { marginLeft: 'auto', padding: S.sm },
  list: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingRight: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  rail: { width: 2, alignSelf: 'stretch', marginRight: S.md },
  status: { fontFamily: F.monoMed, fontSize: 11, width: 34 },
  method: { fontFamily: F.mono, fontSize: 10, color: C.dim, width: 42 },
  path: { flex: 1, fontFamily: F.mono, fontSize: 11, color: C.read },
  ms: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginLeft: S.sm },
  log: { flex: 1, fontFamily: F.mono, fontSize: 11, color: C.read, lineHeight: 16 },
  kvScope: { fontFamily: F.mono, fontSize: 9, color: C.trace, width: 44 },
  kvKey: { fontFamily: F.monoMed, fontSize: 11, color: C.read, maxWidth: '40%' },
  kvVal: { flex: 1, fontFamily: F.mono, fontSize: 10, color: C.dim, marginLeft: S.sm },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: F.sans, fontSize: 12, color: C.dim },
  detailBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.edge,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontFamily: F.sansMed, fontSize: 12, color: C.read },
  curlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.live, paddingHorizontal: S.md, paddingVertical: 6, borderRadius: 4,
  },
  curlText: { fontFamily: F.sansBold, fontSize: 11, color: C.well },
  detailUrl: { fontFamily: F.mono, fontSize: 11, color: C.read, marginTop: S.sm, lineHeight: 16 },
  section: {
    paddingHorizontal: S.md,
    fontFamily: F.sansMed, fontSize: 9, letterSpacing: 1.1, color: C.dim,
    marginTop: S.lg, marginBottom: S.sm,
  },
  detailLine: { fontFamily: F.mono, fontSize: 10, color: C.read, lineHeight: 15 },
  prompt: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge, backgroundColor: C.chassis,
  },
  caret: { fontFamily: F.monoMed, fontSize: 13, color: C.trace },
  promptInput: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.read, padding: 0, height: 30 },
  runBtn: { backgroundColor: C.trace, paddingHorizontal: S.md, paddingVertical: 5, borderRadius: 4 },
  runText: { fontFamily: F.sansBold, fontSize: 11, color: C.well },
  metric: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingRight: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  metricLabel: { flex: 1, fontFamily: F.sans, fontSize: 12, color: C.read },
  metricValue: { fontFamily: F.monoMed, fontSize: 12, marginLeft: S.sm, color: C.read },
  reread: {
    alignSelf: 'center', marginTop: S.lg, paddingHorizontal: S.lg, paddingVertical: S.sm,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge, borderRadius: 4,
  },
  rereadText: { fontFamily: F.sansMed, fontSize: 11, color: C.dim },
});
