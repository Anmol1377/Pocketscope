// Optional native modules. A dev client built before one of these was added throws
// on import — the UI must degrade, never block or crash.
import { Text, StatusBar, Platform } from 'react-native';

const optional = (load) => { try { return load(); } catch { return null; } };

const AS = optional(() => {
  const m = require('@react-native-async-storage/async-storage').default;
  return m && typeof m.getItem === 'function' ? m : null;
});
const CB = optional(() => {
  const m = require('expo-clipboard');
  return m && typeof m.setStringAsync === 'function' ? m : null;
});
const VI = optional(() => require('@expo/vector-icons').Ionicons);
const FONT = optional(() => require('@expo-google-fonts/ibm-plex-sans'));
const MONO = optional(() => require('@expo-google-fonts/ibm-plex-mono'));
const useFontsFn = optional(() => require('expo-font').useFonts);

export const hasStorage = !!AS;
export const getItem = async (k) => { try { return AS ? await AS.getItem(k) : null; } catch { return null; } };
export const setItem = async (k, v) => { try { if (AS) await AS.setItem(k, v); } catch {} };

export const hasClipboard = !!CB;
export const copy = async (t) => { try { if (CB) { await CB.setStringAsync(t); return true; } } catch {} return false; };

// Fonts are cosmetic. Load them if we can, never gate the first render on them.
export const FONT_MAP = FONT && MONO ? {
  IBMPlexSans_400Regular: FONT.IBMPlexSans_400Regular,
  IBMPlexSans_500Medium: FONT.IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold: FONT.IBMPlexSans_600SemiBold,
  IBMPlexMono_400Regular: MONO.IBMPlexMono_400Regular,
  IBMPlexMono_500Medium: MONO.IBMPlexMono_500Medium,
} : null;
export const useOptionalFonts = () => {
  if (!useFontsFn || !FONT_MAP) return false;
  try { return useFontsFn(FONT_MAP)[0]; } catch { return false; }
};

// Text fallbacks so the toolbar stays usable without the icon font.
const GLYPH = {
  'chevron-back': '‹', 'chevron-forward': '›', 'home-outline': '⌂',
  'terminal-outline': '>_', 'share-outline': '↑', 'ellipsis-horizontal': '···',
  'chevron-down': '▾', 'chevron-up': '▴', 'close': '✕', 'refresh': '⟳',
  'lock-closed': '•', 'warning': '!', 'copy-outline': '⧉',
  'radio-button-on': '◉', 'radio-button-off': '○', 'trash-outline': '⌫',
  'layers-outline': '▤',
};
export const hasIcons = !!VI;
export function Icon({ name, size = 16, color, style }) {
  if (VI) return <VI name={name} size={size} color={color} style={style} />;
  return <Text style={[{ color, fontSize: size * 0.9 }, style]}>{GLYPH[name] ?? '·'}</Text>;
}

// Safe-area context is a native view manager; an older dev client has no such view.
// Fall back to the status-bar height, which is all we actually need on Android.
const SAFE = optional(() => {
  const m = require('react-native-safe-area-context');
  return m && m.SafeAreaProvider && m.useSafeAreaInsets ? m : null;
});
export const hasSafeArea = !!SAFE;
export const SafeAreaHost = SAFE ? SAFE.SafeAreaProvider : ({ children }) => children;
export const useInsets = () => {
  if (SAFE) { try { return SAFE.useSafeAreaInsets(); } catch {} }
  return { top: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 20, bottom: 0, left: 0, right: 0 };
};
