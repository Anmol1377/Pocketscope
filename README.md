# Pocketscope

**DevTools in your pocket.** A mobile browser built for developers — Console, Network,
Storage, Elements, and a JS runner attached to every page you open.

Debugging a mobile site today means plugging your phone into a laptop and opening
`chrome://inspect`. Pocketscope removes the laptop.

## Status

Pre-code. Specs plus a runnable starting point.

**Stack:** React Native (Expo) + `react-native-webview`.

| Doc | What's in it |
|---|---|
| [PRD.md](PRD.md) | Problem, users, scope, features, metrics, non-goals |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the inspection actually works, and what it can't see (v2 design) |
| [BUILD.md](BUILD.md) | **Start here.** Build order, and the shortcut that makes v1 ~90 lines |
| [TODO.md](TODO.md) | What's done, what's next |
| [App.js](App.js) | The app — shell, drawer, injected agent |
| [docs/index.html](docs/index.html) | Landing page / in-app start page (GitHub Pages) |

## The one-line pitch

Open a URL. Tap the drawer. See your `console.log`, your failing API call, your
LocalStorage — on the device where the bug actually happens.

## Naming

`Pocketscope` is the working name. Alternatives considered: Palmscope, Inspek,
Probe, Lensr, Tapdev. Renaming is a find-and-replace across three files right now,
so it's cheap to change until code exists.
