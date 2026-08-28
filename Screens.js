import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { Icon } from './native';
import { C, F, S } from './theme';

const prettyUrl = (u) =>
  !u || u === 'about:start' || u.startsWith('https://pocketscope.local') ? 'Start page' : u;

const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
};

export function Screen({ title, onClose, action, topInset = 0, children }) {
  return (
    <View style={s.screen}>
      <View style={[s.bar, { height: 48 + topInset, paddingTop: topInset }]}>
        <Pressable onPress={onClose} hitSlop={10} style={s.barBtn}>
          <Icon name="chevron-back" size={18} color={C.read} />
        </Pressable>
        <Text style={s.barTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10} style={s.barAction}>
            <Text style={s.barActionText}>{action.label}</Text>
          </Pressable>
        ) : <View style={s.barBtn} />}
      </View>
      {children}
    </View>
  );
}

export function Empty({ text }) {
  return <View style={s.empty}><Text style={s.emptyText}>{text}</Text></View>;
}

/* ── Tabs ─────────────────────────────────────────────── */
export function Tabs({ tabs, activeId, onPick, onClose, onCloseTab, onNew, onNewPrivate, onCloseAll, topInset }) {
  return (
    <Screen title="Tabs" topInset={topInset} onClose={onClose} action={tabs.length > 1 ? { label: 'Close all', onPress: onCloseAll } : null}>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: S.xl }}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => onPick(t.id)}
            style={[s.tabCard, t.id === activeId && s.tabCardOn]}>
            <Icon name={t.private ? 'eye-off-outline' : 'globe-outline'} size={15}
                  color={t.private ? C.warn : C.dim} />
            <View style={{ flex: 1 }}>
              <Text style={s.tabTitle} numberOfLines={1}>{t.title || 'New tab'}</Text>
              <Text style={s.tabUrl} numberOfLines={1}>{t.private ? 'Private' : prettyUrl(t.url)}</Text>
            </View>
            <Pressable onPress={() => onCloseTab(t.id)} hitSlop={10} style={{ padding: 4 }}>
              <Icon name="close" size={15} color={C.dim} />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.footer}>
        <Pressable onPress={onNew} style={s.footBtn}>
          <Icon name="add" size={16} color={C.well} />
          <Text style={s.footText}>New tab</Text>
        </Pressable>
        <Pressable onPress={onNewPrivate} style={[s.footBtn, s.footBtnGhost]}>
          <Icon name="eye-off-outline" size={15} color={C.warn} />
          <Text style={[s.footText, { color: C.warn }]}>Private</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

/* ── History / Bookmarks / Downloads share one list shape ── */
export function UrlList({ title, items, onClose, onOpen, onRemove, onClear, empty, searchable, topInset }) {
  const [q, setQ] = useState('');
  const shown = q
    ? items.filter((x) => (x.title + ' ' + x.url).toLowerCase().includes(q.toLowerCase()))
    : items;
  return (
    <Screen title={title} topInset={topInset} onClose={onClose} action={items.length ? { label: 'Clear', onPress: onClear } : null}>
      {searchable && !!items.length && (
        <View style={s.searchWrap}>
          <Icon name="search" size={13} color={C.dim} />
          <TextInput
            style={s.search} value={q} onChangeText={setQ}
            placeholder="Filter" placeholderTextColor={C.dim}
            autoCapitalize="none" autoCorrect={false} selectionColor={C.trace}
          />
        </View>
      )}
      {!shown.length ? <Empty text={q ? 'Nothing matches.' : empty} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: S.xl }}>
          {shown.map((x) => (
            <Pressable key={x.url + x.at} onPress={() => onOpen(x.url)} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{x.title || x.url}</Text>
                <Text style={s.rowUrl} numberOfLines={1}>{x.url}</Text>
              </View>
              <Text style={s.rowAgo}>{ago(x.at)}</Text>
              <Pressable onPress={() => onRemove(x.url)} hitSlop={10} style={{ padding: 4 }}>
                <Icon name="close" size={14} color={C.dim} />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

/* ── Settings ─────────────────────────────────────────── */
export function Settings({ homeKey, homes, onPickHome, onClose, onClearData, onClearCaptured, preserveLog, onTogglePreserve, desktopUA, onToggleUA, topInset }) {
  const Row = ({ icon, label, hint, right, onPress, danger }) => (
    <Pressable onPress={onPress} style={s.setRow}>
      <Icon name={icon} size={16} color={danger ? C.fail : C.dim} />
      <View style={{ flex: 1 }}>
        <Text style={[s.setLabel, danger && { color: C.fail }]}>{label}</Text>
        {!!hint && <Text style={s.setHint}>{hint}</Text>}
      </View>
      {right}
    </Pressable>
  );
  const Toggle = ({ on }) => (
    <View style={[s.toggle, on && s.toggleOn]}>
      <View style={[s.knob, on && s.knobOn]} />
    </View>
  );
  return (
    <Screen title="Settings" topInset={topInset} onClose={onClose}>
      <ScrollView contentContainerStyle={{ paddingBottom: S.xl }}>
        <Text style={s.section}>START PAGE</Text>
        {Object.entries(homes).map(([key, h]) => (
          <Row
            key={key} icon={homeKey === key ? 'radio-button-on' : 'radio-button-off'}
            label={h.label} onPress={() => onPickHome(key)}
          />
        ))}

        <Text style={s.section}>BROWSING</Text>
        <Row icon="desktop-outline" label="Request desktop site"
             hint="Send a desktop user agent" onPress={onToggleUA} right={<Toggle on={desktopUA} />} />

        <Text style={s.section}>INSPECTOR</Text>
        <Row icon="albums-outline" label="Keep log across pages"
             hint={preserveLog ? 'Requests and console persist when you navigate'
                               : 'Cleared on each page load, like Chrome DevTools'}
             onPress={onTogglePreserve} right={<Toggle on={preserveLog} />} />
        <Row icon="trash-outline" label="Clear captured data"
             hint="Requests, console output and storage readings" onPress={onClearCaptured} />

        <Text style={s.section}>PRIVACY</Text>
        <Row icon="nuclear-outline" label="Clear browsing data" danger
             hint="Cache, cookies, form data, history and downloads" onPress={onClearData} />

        <Text style={s.section}>ABOUT</Text>
        <View style={s.about}>
          <Text style={s.aboutText}>Pocketscope v0.1 — a browser that shows you what the page is really doing.</Text>
          <Text style={s.aboutText}>Rendering with Chromium (Android System WebView).</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  screen: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.well, zIndex: 10,
  },
  bar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingBottom: S.sm, paddingHorizontal: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.edge, backgroundColor: C.chassis,
  },
  barBtn: { width: 44, alignItems: 'center' },
  barTitle: { flex: 1, fontFamily: F.sansBold, fontSize: 15, color: C.read },
  barAction: { paddingHorizontal: S.md },
  barActionText: { fontFamily: F.sansMed, fontSize: 12, color: C.fail },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl },
  emptyText: { fontFamily: F.sans, fontSize: 13, color: C.dim, textAlign: 'center' },

  tabCard: {
    flexDirection: 'row', alignItems: 'center', gap: S.md,
    padding: S.md, marginBottom: S.sm, borderRadius: 6,
    backgroundColor: C.chassis, borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge,
  },
  tabCardOn: { borderColor: C.trace },
  tabTitle: { fontFamily: F.sansMed, fontSize: 13, color: C.read },
  tabUrl: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 2 },

  footer: {
    flexDirection: 'row', gap: S.sm, padding: S.md,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge, backgroundColor: C.chassis,
  },
  footBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.trace, paddingVertical: 11, borderRadius: 5,
  },
  footBtnGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: C.warn },
  footText: { fontFamily: F.sansBold, fontSize: 12, color: C.well },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    margin: S.md, paddingHorizontal: S.md, height: 34, borderRadius: 5,
    backgroundColor: C.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge,
  },
  search: { flex: 1, fontFamily: F.mono, fontSize: 12, color: C.read, padding: 0 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: S.sm,
    paddingHorizontal: S.md, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  rowTitle: { fontFamily: F.sansMed, fontSize: 13, color: C.read },
  rowUrl: { fontFamily: F.mono, fontSize: 10, color: C.dim, marginTop: 2 },
  rowAgo: { fontFamily: F.mono, fontSize: 10, color: C.dim },

  section: {
    fontFamily: F.sansMed, fontSize: 9, letterSpacing: 1.2, color: C.dim,
    paddingHorizontal: S.md, marginTop: S.xl, marginBottom: S.xs,
  },
  setRow: {
    flexDirection: 'row', alignItems: 'center', gap: S.md,
    paddingHorizontal: S.md, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.chassis,
  },
  setLabel: { fontFamily: F.sansMed, fontSize: 13, color: C.read },
  setHint: { fontFamily: F.sans, fontSize: 11, color: C.dim, marginTop: 2 },
  toggle: { width: 38, height: 22, borderRadius: 11, backgroundColor: C.edge, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: C.trace },
  knob: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.dim },
  knobOn: { backgroundColor: C.well, alignSelf: 'flex-end' },
  about: { paddingHorizontal: S.md, paddingTop: S.sm, gap: S.sm },
  aboutText: { fontFamily: F.sans, fontSize: 11, color: C.dim, lineHeight: 17 },
});
