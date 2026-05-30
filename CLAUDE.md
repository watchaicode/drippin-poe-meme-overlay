# PoE Overlay — Claude context

Transparent Electron overlay for Path of Exile 1 & 2 leveling. Reads the game's `Client.txt` log to follow your zone + character level, and surfaces zone-specific notes + level-gated build advice. Runs as a topmost frameless window with a click-through hotkey so it stays useful over the game.

## Quick start

```powershell
# Install once
npm install

# If Electron's binary postinstall didn't run (see Gotchas), do this:
node node_modules\electron\install.js
# …or manually extract the cached zip from %LOCALAPPDATA%\electron\Cache\<hash>\ to
# node_modules\electron\dist\ and write "electron.exe" to node_modules\electron\path.txt

# Dev (HMR for renderer, restarts Electron on main/preload changes)
npm run dev

# Production launch (after a build)
npm run build
npm start

# Type-check
npm run typecheck

# Desktop shortcut launches: node_modules\electron\dist\electron.exe . (working dir = project root)
# That binary reads package.json -> main, which points at out/main/index.js (built file).
```

## Stack

- **Electron** (main + preload + renderer) via **electron-vite**
- **React 18 + TypeScript** in the renderer
- **Tailwind** for styling
- **No bundler complications** — `electron-vite` handles all three process bundles in one config

## Architecture

Three processes, standard Electron split:

- `src/main/index.ts` — window creation, click-through state, hotkey registration, IPC handlers
- `src/main/client-watcher.ts` — finds PoE installs, tails `Client.txt`, parses zone/level/login events
- `src/main/disk-content.ts` — reads user-authored builds + customizations from `%APPDATA%`
- `src/preload/index.ts` — exposes a typed `window.overlay` API via `contextBridge`
- `src/renderer/src/App.tsx` — UI shell, state, editor toggle
- `src/renderer/src/Editor.tsx` — in-app editor for custom additions
- `src/renderer/src/useCustomizations.ts` — hook for custom additions storage

Renderer never imports `electron` directly — everything goes through `window.overlay.*` in the preload bridge.

## Content system (the important part)

There are three layers, merged at lookup time:

```
Route (generic, game template)
  └─ ZoneStep[] with notes, reminders, layoutImages, act number
       └─ steps[].reminders are generic POIs (bosses, optional items)

Build (overlay on top of a Route, friend-authorable)
  └─ vendorRegex
  └─ buildReminders[]   ← always visible, level-gated
  └─ zoneReminders[zone] ← per-zone build advice, prepended to route reminders

Customizations (user-authored on top of a Build, edited in-app)
  └─ additions[] with scope = {zone: X} or {build}
       prepended to whatever they target
```

`findStep(build, zone)` returns the route's zone step with the build's `zoneReminders[zone]` prepended. The renderer then prepends customizations on top of that, level-filters, and renders.

### Files

```
src/renderer/src/content/
├── types.ts                      Route, Build, ZoneStep, Reminder, CustomAddition
├── index.ts                      findStep, defaultBuild, visibleReminders, visibleBuildReminders
├── routes/
│   └── poe2-campaign.json        65 zones across Acts 1–4 (generic — bosses, POIs, layout images)
└── builds/
    └── poe2-mercenary-grenades.json   Mercenary Grenades build (Mobalytics, GuyThatDies)
```

Built-in builds are imported statically into `content/index.ts`. **Disk builds** loaded from `%APPDATA%\Roaming\poe-overlay\builds\*.json` are appended at runtime by `useAllBuilds()` in `App.tsx`.

### Schema (TypeScript types in `content/types.ts`)

```ts
Reminder { text; fromLevel?; toLevel?; kind?: 'gem'|'flask'|'vendor'|'item'|'passive'|'boss'|'general'; url?; highlight?: boolean }
ZoneStep { zone; act?; notes?: string[]; reminders?: Reminder[]; layoutImages?: string[] }
Route    { game; routeId; name; steps: ZoneStep[] }
Build    { buildId; name; game; routeId; vendorRegex?; buildReminders?: Reminder[]; zoneReminders?: Record<zone, Reminder[]> }
CustomAddition { id; scope: {type:'zone', zone} | {type:'build'}; text; kind?; fromLevel?; toLevel?; url?; highlight? }
```

### Rendering conventions

- **Permanent buff** (any reminder text matching `/Permanent Buff/i`) renders with a `★` prefix + amber/bold — handled in `ReminderRow`. `highlight: true` triggers the same.
- **Optional content** (text starting with `(opt) `) renders italic + dimmed. The `(opt) ` prefix is stripped before display.
- **Level filter**: `passesLevel(r, level)` checks `fromLevel`/`toLevel`. A `toLevel: 16` reminder shows up to and including character level 16.
- **Layout images** load from `https://raw.githubusercontent.com/nicolasbagatello/poe2-helper/main/images/<filename>`. Multi-seed zones (e.g. Clearfell has 2) are click-to-cycle.
- **Done state** is persisted in `localStorage` per build (`poe-overlay:done:<buildId>`). Toggling hides the reminder; footer shows `done (N)` to reveal them.

## Click-through

Global hotkey `Alt+Shift+O` (registered in main via `globalShortcut`). Toggles `setIgnoreMouseEvents` on the window. When on:
- Border switches dashed sky-blue (from solid amber)
- Overall opacity drops to 70%
- A `👻 click-through · Alt+Shift+O` pill appears in the header

**The only way to disable it once on is the hotkey** — by definition no UI button is clickable. If `globalShortcut.register` fails (another app owns the combo), the main process logs a warning. Swap the hotkey in `src/main/index.ts` if needed.

## Editor (in-app)

`✎` button in the header opens the editor panel (replaces main content). Lets the user:
- Add a Reminder pinned to a Zone (dropdown grouped by Act) or Build-wide
- Pick icon kind, highlight, fromLevel/toLevel, optional URL
- See/edit/delete their custom additions

Storage: `%APPDATA%\Roaming\poe-overlay\customizations\<buildId>.json` via IPC (`overlay:loadCustom` / `overlay:saveCustom`). One file per build so per-build progress is independent.

## PoE 2 vs PoE 1 differences (in `client-watcher.ts`)

| Event | PoE 1 | PoE 2 |
|---|---|---|
| Zone change | `You have entered <Zone>.` | `[SCENE] Set Source [<Zone>]` |
| Level up | `: <Char> (<Class>) is now level <N>` | Same |
| Instance connect | `Connecting to instance server at …` | Same |

`POE2_ZONE_IGNORE` filters the `(null)` (loading) and `(unknown)` (login/char-select) scene values. **`Act N` (e.g. `Act 1`, `Act 2`) also leaks through as a pseudo-zone when the player opens the waypoint menu** — known false positive, not yet filtered. Add to ignore list if it gets noisy.

`detectClients()` globs both Steam (`steamapps/common/Path of Exile*`) and GGG standalone (`Grinding Gear Games/Path of Exile*`) folders. `pickActiveClient()` picks the most-recently-modified `Client.txt` so switching games auto-follows.

## Known gotchas

1. **Electron postinstall doesn't run during `npm install`** — at least on the dev machine this was first set up on. The 115MB binary downloads to cache but doesn't extract. Workaround at the top of Quick Start.
2. **Party-member level events** are also in your Client.txt. The parser fires for all of them, so the displayed "character" name flips to whoever leveled most recently. No filter yet — the first character we see should ideally be locked as "the local player" but isn't.
3. **`Act N` pseudo-zone** — opening the waypoint menu emits `[SCENE] Set Source [Act 1]` etc. Treated as a real zone right now; produces the "No notes" fallback when seen.
4. **CSS `zoom` is non-standard** but works in Chromium/Electron. Used in `App.tsx` for the `+`/`−` font-size scaler on the content area only (header/footer stay fixed so buttons are always clickable).
5. **Done items are keyed per-build** by buildId. Switching builds gives a fresh slate. Switching builds via picker isn't implemented yet — `defaultBuild` returns the first build for the game.

## Extension recipes

### Add a new build (someone hands you a JSON)

Drop it at `%APPDATA%\Roaming\poe-overlay\builds\<whatever>.json`. App reloads it on startup via `listDiskBuilds`. Must match the `Build` shape — minimum required: `buildId`, `name`, `game`, `routeId`.

Or bundle it into the app: drop in `src/renderer/src/content/builds/`, import in `content/index.ts`, append to `BUILTIN_BUILDS`.

### Add a new zone to the route

Edit `src/renderer/src/content/routes/poe2-campaign.json`. The data was originally generated from <https://github.com/nicolasbagatello/poe2-helper> `data/zones.json` — see the Python transform script in chat history (or write a fresh one with `curl https://raw.githubusercontent.com/nicolasbagatello/poe2-helper/main/data/zones.json -o zones-source.json` then transform).

### Add build content for an existing zone

Edit the build JSON's `zoneReminders[<exact zone name>]`. Build-specific reminders are merged in front of the route's generic ones.

### Change the click-through hotkey

`CLICK_THROUGH_HOTKEY` in `src/main/index.ts`. Format: Electron accelerator string (e.g. `Alt+Shift+O`, `F9`, `Ctrl+Alt+H`).

## Sources

- Mercenary Grenades build: [Mobalytics — [0.5] Mercenary Grenades Leveling](https://mobalytics.gg/poe-2/builds/mercenary-grenades-leaguestarter) by GuyThatDies
- PoE 2 zones data: [nicolasbagatello/poe2-helper](https://github.com/nicolasbagatello/poe2-helper) — zone names, layout images, route notes, POIs
