import { useRef, useState } from 'react';
import { SafeAreaView, View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// Loads Eruda from CDN and opens it. Runs before the page's own scripts,
// so early console.log / fetch calls are captured too.
const INJECT = `
(function () {
  if (window.__pocketscope) return;
  window.__pocketscope = 1;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda';
  s.onload = function () { try { eruda.init(); } catch (e) {} };
  (document.head || document.documentElement).appendChild(s);
})();
true; // required on iOS — a non-true return logs a warning
`;

const normalize = (t) =>
  /^https?:\/\//.test(t) ? t
  : /\.\w{2,}($|\/)/.test(t) ? 'https://' + t
  : 'https://duckduckgo.com/?q=' + encodeURIComponent(t);

export default function App() {
  const web = useRef(null);
  const [input, setInput] = useState('https://example.com');
  const [url, setUrl] = useState('https://example.com');
  const [canGoBack, setCanGoBack] = useState(false);

  return (
    <SafeAreaView style={s.root}>
      <View style={s.bar}>
        <Pressable
          onPress={() => web.current?.goBack()}
          disabled={!canGoBack}
          style={s.btn}>
          <Text style={[s.btnText, !canGoBack && s.dim]}>‹</Text>
        </Pressable>

        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => setUrl(normalize(input.trim()))}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          placeholder="URL or search"
          placeholderTextColor="#666"
        />

        <Pressable onPress={() => web.current?.reload()} style={s.btn}>
          <Text style={s.btnText}>⟳</Text>
        </Pressable>
      </View>

      <WebView
        ref={web}
        source={{ uri: url }}
        injectedJavaScriptBeforeContentLoaded={INJECT}
        onNavigationStateChange={(nav) => {
          setInput(nav.url);
          setCanGoBack(nav.canGoBack);
        }}
        // Android: re-inject on load, since "before content" is best-effort there
        injectedJavaScript={INJECT}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        style={s.web}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 6, gap: 6 },
  btn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#eee', fontSize: 22 },
  dim: { color: '#444' },
  input: {
    flex: 1, height: 34, borderRadius: 17, paddingHorizontal: 14,
    backgroundColor: '#222', color: '#eee', fontSize: 13,
  },
  web: { flex: 1 },
});
