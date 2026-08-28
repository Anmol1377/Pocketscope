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

const TABS = ['Network', 'Console', 'Element', 'Audit', 'Storage', 'Perf'];
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

export default function DevDrawer({
  reqs, logs, storage, perf, element, audit,
  height, setHeight, onClose, onRefreshStorage, onRefreshPerf, onRefreshAudit,
  onEval, onClear, inspecting, onToggleInspect,
}) {
  const [tab, setTab] = useState('Network');
  const [sel, setSel] = useState(null);
  const [filter, setFilter] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
        {TABS.map((x) => (
          <Pressable
            key={x}
            onPress={() => {
              setSel(null); setTab(x);
              if (x === 'Storage') onRefreshStorage();
              if (x === 'Perf') onRefreshPerf();
              if (x === 'Audit') onRefreshAudit();
              if (x === 'Element' && !inspecting) onToggleInspect(true);
            }}
            style={[d.tab, tab === x && d.tabOn]}>
            <Text style={[d.tabText, tab === x && d.tabTextOn]}>{x.toUpperCase()}</Text>
          </Pressable>
        ))}
        </ScrollView>
        <View style={d.tabActions}>
          <Pressable onPress={onClear} hitSlop={8} style={d.iconBtn}>
            <Icon name="ban-outline" size={16} color={C.dim} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8} style={d.iconBtn}>
            <Icon name="close" size={17} color={C.dim} />
          </Pressable>
        </View>
      </View>

      {sel ? (
        <Detail req={sel} onBack={() => setSel(null)} onCopy={copy} />
      ) : tab === 'Network' ? (
        <>
        <View style={d.filterBar}>
          <Icon name="search" size={12} color={C.dim} />
          <TextInput
            style={d.filterInput} value={filter} onChangeText={setFilter}
            placeholder="Filter by URL, method or status" placeholderTextColor={C.dim}
            autoCapitalize="none" autoCorrect={false} selectionColor={C.trace}
          />
          <Pressable onPress={() => setOnlyFailed(!onlyFailed)} hitSlop={6}
                     style={[d.chip, onlyFailed && d.chipOn]}>
            <Text style={[d.chipText, onlyFailed && { color: C.well }]}>Failed</Text>
          </Pressable>
        </View>
        <List
          follow
          data={reqs.filter((r) => {
            if (onlyFailed && r.status && r.status < 400) return false;
            if (!filter) return true;
            const q = filter.toLowerCase();
            return (r.url + ' ' + r.method + ' ' + (r.status || '')).toLowerCase().includes(q);
          })}
          empty={filter || onlyFailed ? 'Nothing matches that filter.' : 'No requests yet. Load a page.'}
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
        </>
      ) : tab === 'Element' ? (
        <ElementPanel element={element} inspecting={inspecting} onToggle={onToggleInspect} onCopy={copy} />
      ) : tab === 'Audit' ? (
        <AuditPanel audit={audit} onRefresh={onRefreshAudit} />
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

function ElementPanel({ element, inspecting, onToggle, onCopy }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={d.inspectBar}>
        <Pressable onPress={() => onToggle(!inspecting)} style={[d.inspectBtn, inspecting && d.inspectOn]}>
          <Icon name="scan-outline" size={14} color={inspecting ? C.well : C.trace} />
          <Text style={[d.inspectText, inspecting && { color: C.well }]}>
            {inspecting ? 'Tap any element' : 'Start inspecting'}
          </Text>
        </Pressable>
        {!!element && (
          <Pressable onPress={() => onCopy(element.html)} hitSlop={8} style={d.iconBtn}>
            <Icon name="copy-outline" size={15} color={C.dim} />
          </Pressable>
        )}
      </View>
      {!element ? (
        <View style={d.emptyWrap}>
          <Text style={d.empty}>
            {inspecting ? 'Tap something on the page.' : 'Turn on inspecting, then tap an element.'}
          </Text>
        </View>
      ) : (
        <ScrollView style={d.list} contentContainerStyle={{ padding: S.md, paddingBottom: S.xl }}>
          <Text style={d.elSel} selectable>{element.sel}</Text>
          <Text style={d.elPath} selectable>{element.path}</Text>
          <View style={d.boxRow}>
            <Metric label="width" value={element.rect.w + 'px'} />
            <Metric label="height" value={element.rect.h + 'px'} />
            <Metric label="x" value={element.rect.x} />
            <Metric label="y" value={element.rect.y} />
          </View>
          {!!element.text && <><Text style={d.section}>TEXT</Text>
            <Text style={d.detailLine} selectable>{element.text}</Text></>}
          <Text style={d.section}>COMPUTED</Text>
          {Object.entries(element.styles).map(([k, v]) => (
            <View key={k} style={d.styleRow}>
              <Text style={d.styleKey}>{k}</Text>
              <Text style={d.styleVal} selectable>{v}</Text>
            </View>
          ))}
          <Text style={d.section}>HTML</Text>
          <Text style={d.detailLine} selectable>{element.html}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function Metric({ label, value }) {
  return (
    <View style={d.boxCell}>
      <Text style={d.boxVal}>{value}</Text>
      <Text style={d.boxLabel}>{label}</Text>
    </View>
  );
}

const LEVEL = { fail: C.fail, warn: C.warn, info: C.trace, pass: C.live };

function AuditPanel({ audit, onRefresh }) {
  if (!audit) return <View style={d.emptyWrap}><Text style={d.empty}>Reading the page…</Text></View>;
  const fails = audit.filter((a) => a.level === 'fail').length;
  const warns = audit.filter((a) => a.level === 'warn').length;
  return (
    <ScrollView style={d.list} contentContainerStyle={{ paddingBottom: S.xl }}>
      <View style={d.auditHead}>
        <Text style={[d.auditCount, { color: fails ? C.fail : C.live }]}>{fails} failing</Text>
        <Text style={[d.auditCount, { color: warns ? C.warn : C.dim }]}>{warns} warnings</Text>
        <Pressable onPress={onRefresh} hitSlop={8} style={{ marginLeft: 'auto' }}>
          <Icon name="refresh" size={14} color={C.dim} />
        </Pressable>
      </View>
      {audit.map((a, i) => (
        <View key={i} style={d.row}>
          <View style={[d.rail, { backgroundColor: LEVEL[a.level] || C.edge }]} />
          <View style={{ flex: 1 }}>
            <Text style={[d.auditTitle, { color: LEVEL[a.level] || C.read }]}>{a.title}</Text>
            <Text style={d.auditDetail}>{a.detail}</Text>
          </View>
        </View>
      ))}
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
  tabActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: S.sm },
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
  detailLine: { fontFamily: F.mono, fontSize: 10, color: C.read, lineHeight: 15, paddingHorizontal: S.md },
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  filterInput: { flex: 1, fontFamily: F.mono, fontSize: 11, color: C.read, padding: 0, height: 24 },
  chip: {
    paddingHorizontal: S.sm, paddingVertical: 3, borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge,
  },
  chipOn: { backgroundColor: C.fail, borderColor: C.fail },
  chipText: { fontFamily: F.sansMed, fontSize: 10, color: C.dim },
  inspectBar: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  inspectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.trace,
  },
  inspectOn: { backgroundColor: C.trace, borderColor: C.trace },
  inspectText: { fontFamily: F.sansBold, fontSize: 11, color: C.trace },
  elSel: { fontFamily: F.monoMed, fontSize: 14, color: C.trace },
  elPath: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 3, lineHeight: 15 },
  boxRow: { flexDirection: 'row', gap: S.sm, marginTop: S.md },
  boxCell: {
    flex: 1, alignItems: 'center', paddingVertical: S.sm, borderRadius: 4,
    backgroundColor: C.chassis, borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge,
  },
  boxVal: { fontFamily: F.monoMed, fontSize: 12, color: C.read },
  boxLabel: { fontFamily: F.sans, fontSize: 9, color: C.dim, marginTop: 2 },
  styleRow: { flexDirection: 'row', paddingVertical: 3 },
  styleKey: { width: '42%', fontFamily: F.mono, fontSize: 10, color: C.dim },
  styleVal: { flex: 1, fontFamily: F.mono, fontSize: 10, color: C.read },
  auditHead: {
    flexDirection: 'row', alignItems: 'center', gap: S.md,
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  auditCount: { fontFamily: F.monoMed, fontSize: 11 },
  auditTitle: { fontFamily: F.sansMed, fontSize: 12 },
  auditDetail: { fontFamily: F.sans, fontSize: 11, color: C.dim, marginTop: 2, lineHeight: 16 },
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
