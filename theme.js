// Instrument palette. Colour encodes state, never decorates.
// The chassis is lighter than the readout well — the way real test gear is built.
export const C = {
  well:    '#0E1216',  // readout background, where data lives
  chassis: '#191F26',  // toolbars, drawer surface
  raised:  '#212932',  // input fields, pressed states
  edge:    '#2A333D',  // hairlines
  dim:     '#6B7A88',  // labels, secondary
  read:    '#D8E1E8',  // primary readout
  live:    '#4DD8A6',  // 2xx, ok
  warn:    '#E8B54A',  // 3xx, warnings
  fail:    '#FF5F52',  // 4xx/5xx, errors
  trace:   '#5AA9E6',  // progress, selection, the scope trace
};

export const F = {
  sans:     'IBMPlexSans_400Regular',
  sansMed:  'IBMPlexSans_500Medium',
  sansBold: 'IBMPlexSans_600SemiBold',
  mono:     'IBMPlexMono_400Regular',
  monoMed:  'IBMPlexMono_500Medium',
};

// 4pt rhythm
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const statusColor = (n) =>
  !n ? C.fail : n >= 500 ? C.fail : n >= 400 ? C.fail : n >= 300 ? C.warn : C.live;
