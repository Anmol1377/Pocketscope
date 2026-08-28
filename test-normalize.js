// Minimal check: the home sentinel and real URLs must not be turned into searches.
const START = 'about:start';
const normalize = (t) =>
  /^https?:\/\//.test(t) ? t
  : /\.\w{2,}($|\/)/.test(t) ? 'https://' + t
  : 'https://www.google.com/search?q=' + encodeURIComponent(t);
const go = (text) => { const t = String(text).trim(); return t === START ? START : normalize(t); };

const cases = [
  [START,                 START],
  ['about:start',         START],
  ['https://github.com',  'https://github.com'],
  ['github.com',          'https://github.com'],
  ['news.ycombinator.com','https://news.ycombinator.com'],
  ['how to debug',        'https://www.google.com/search?q=how%20to%20debug'],
];
let bad = 0;
for (const [input, want] of cases) {
  const got = go(input);
  if (got !== want) { console.error(`FAIL ${JSON.stringify(input)} -> ${got} (want ${want})`); bad++; }
}
console.log(bad ? `${bad} failed` : `all ${cases.length} passed`);
process.exit(bad ? 1 : 0);
