import { useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, PanResponder, Dimensions,
} from 'react-native';
import { copy as copyText, Icon } from './native';
import { C, F, S, statusColor } from './theme';

const TABS = ['Network', 'Console', 'Storage'];
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

export default function DevDrawer({ reqs, logs, storage, height, setHeight, onClose, onRefreshStorage }) {
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
            onPress={() => { setSel(null); setTab(x); if (x === 'Storage') onRefreshStorage(); }}
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
        <List
          data={logs}
          empty="No console output yet."
          render={(l, i) => (
            <View key={l.key ?? i} style={d.row}>
              <View style={[d.rail, { backgroundColor: l.level === 'error' ? C.fail : l.level === 'warn' ? C.warn : C.edge }]} />
              <Text
                style={[d.log, l.level === 'error' && { color: C.fail }, l.level === 'warn' && { color: C.warn }]}
                selectable>
                {l.text}
              </Text>
            </View>
          )}
        />
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

function List({ data, render, empty }) {
  if (!data.length) return <View style={d.emptyWrap}><Text style={d.empty}>{empty}</Text></View>;
  return (
    <ScrollView style={d.list} contentContainerStyle={{ paddingBottom: S.lg }}>
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
    fontFamily: F.sansMed, fontSize: 9, letterSpacing: 1.1, color: C.dim,
    marginTop: S.lg, marginBottom: S.sm,
  },
  detailLine: { fontFamily: F.mono, fontSize: 10, color: C.read, lineHeight: 15 },
});
