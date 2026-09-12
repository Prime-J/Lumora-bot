# Lumora Architecture

## Runtime model

- Single Node.js process runs two servers inside one event loop:
  - Express static + JSON API server on `PORT` (default 10000) for the web dashboard.
  - Baileys WhatsApp socket through `@whiskeysockets/baileys`.
- The only shared mutable runtime singleton is `global._lumoraSock`, set once the socket opens.
- Everything else is file + MongoDB driven. `index.js` is a wiring shell that:
  1. starts Express,
  2. loads module headers,
  3. boots players,
  4. creates the socket,
  5. dispatches inbound messages to command handlers stored in a registry.

No module is allowed to import `@whiskeysockets/baileys` directly except `index.js` during boot. All other files receive the socket as a parameter or through `ctx`.

## Module boundaries

### `core/`
Pure game math and engine helpers. No socket, no send, no raw user text parsing.
- `battleMath` — damage, defense, energy, crit, evasion, combat outcomes.
- `xpSystem` — progression and XP related calculations.
- `auraSystem` — aura passive behavior.
- `hpBar` — HP bar rendering helper only.

### `systems/`
Feature systems. Each owns one slice of the game. They accept the socket, chatId, senderId, player store, and settings as needed, or are query-only.
- `players` — player record shape and getters/setters.
- `battle`, `wildbattle`, `playerBattle` — combat flows and encounter resolution.
- `hunting` — hunt state, location, encounters, loot.
- `economy`, `transfer`, `heal`, `spawn`, `bank`, `robbery`, `shards` — economy and item use flows.
- `inventory`, `gear`, `market`, `factionMarket`, `giveItem` — item ownership, equipping, buying.
- `faction*` — faction state, treasury, missions, points, wars, welcome.
- `quests`, `scrolls` — quest and scroll progression.
- `onboarding`, `star`, `updates`, `misc`, `apology`, `meetings`, `artpack`, `combatLock` — meta, presentation glue, and misc flows.
- `pro` — subscription / pro-state helpers.
- `ownerTools` — owner-only control commands.
- `ui`, `buttons`, `interactiveUI`, `flowMarket`, `helpUI` — presentation layer, see below.
- `messageUtils` — single owner of player display names, mention tag construction, and player-facing send helpers.

### `db/`
- `mongo` — MongoDB init, load/save orchestration for players, warm-cache JSON mirror, dirty marking.

### `data/`
Canonical read-only reference data and per-install writable state:
- `Players.json` — live player store JSON warm cache.
- `items.json`, `styles.json`, `mora.json`, `factions.json`, `faction_state.json`, `faction_points.json`, `faction_treasury.json` — world + catalog data.
- `settings.json` — installed config: prefix, currency, owner numbers, group allowlists, media paths.
- `bans.json`, `punishments.json`, `warns.json`, `sudos.json`, `throne.json`, `rules.json`, `bugs.json`, `referrals.json`, `afk.json` — account/session/punishment state.

### `assets/`
Static binary assets referenced at runtime:
- `assets/styles/` — fighting style images.
- `assets/mora/` — Mora images.

### `web/`
Dashboard frontend and the only HTML entry point served at `/`. No bot logic lives here except via `/api/*`.

### `leaderboard.js`
Standalone ranking aggregation used by commands and dashboard. It is a query/formatting concern, not combat logic.

### `canvas` modules
Optional visual card generators. They must be loadable with graceful fallback. If a canvas module is not present, the command that would have used it must fall back to a text message and must never crash startup.

## State ownership

### One writer per piece of state
- Players: owned by `db/mongo` at write time, mirrored to `data/Players.json` as the synchronous warm cache. All reads during dispatch use `loadPlayers()` or a system getter.
- Faction state / points / treasury: owned by their respective `systems/faction*` loaders/savers.
- Item catalog: owned by `data/items.json`, updated only through admin API or commands that explicitly save.
- Punishment / ban / warn / sudo / throne / rules / bug / referral / AFK state: each has one `loadX` / `saveX` pair near `index.js` or in the owning system.

### No hidden globals for game state
- The only allowed global is `global._lumoraSock`.
- `global.blackMarket` is an explicit runtime runtime state object owned by the black-market flow, initialized at startup.

## Data flow

### Inbound message path
1. Socket receives message.
2. `index.js` normalizes and resolves sender, chat, mentioned/joined participants.
3. Command registry and command-specific interceptors in `index.js` route to the responsible system.
4. System mutates state, then calls send helpers from `systems/messageUtils`, `systems/buttons`, or `systems/interactiveUI`.
5. Response goes out through `global._lumoraSock`.

### Dashboard path
1. Browser hits Express static route `/` or `/api/*`.
2. `/api/*` handlers read from the same file-based store or MongoDB.
3. Admin routes are gated by `X-Admin-Token` issued after `/api/admin/login`.

### Presentation path
- Game/text responses should go through `systems/messageUtils` for player names and mentions.
- Rich interactive menus should go through `systems/buttons` for the currently supported WhatsApp button path.
- Experimental native-flow paths belong in `systems/interactiveUI` or `systems/flowMarket` and must never be the only path for a production command without a stable text/button fallback.

## Presentation layer design

### `systems/messageUtils`
Owns:
- resolving a player’s display name from the player store,
- constructing mention-friendly display text and mention JIDs,
- sending player-facing system, DM, battle, and group-announcement messages.

Callers should use this for any message that names a player.

### `systems/ui`
Owns reusable text layout primitives: headers, dividers, cards, lists. Used by help and other text screens.

### `systems/buttons`
Owns the supported WhatsApp button path. If a feature needs interactive choice, this is the first supported layer.

### `systems/interactiveUI`
Currently acts as a wrapper around the button-helper package and provides:
- nativeFlow send/reply wrappers,
- list and action-button send wrappers,
- help menu text builders.

If a piece of the helper API is not reliably working in this setup, the module should isolate that risk and not spread raw helper calls across the codebase.

### `systems/flowMarket`
Owns the HTML-widget native-flow market path:
- build payloads,
- handle tap routing and purchase flow,
- cache the wire-capability probe result so the rest of the app can decide whether to use it.

This module must not be the only route to market functionality; the existing text/command market path remains the supported fallback.

### `systems/helpUI`
Owns the new help menu text structure. It builds text. It does not send. It should not duplicate layout primitives that belong in `systems/ui`.

## What should not exist

- No feature logic inside `web/`.
- No socket import outside `index.js` boot path.
- No player-name or mention formatting copy-pasted across systems; use `messageUtils`.
- No command that only works through an experimental interactive layer without a working fallback.
- No duplicate “market”, “help”, or “profile” formatting scattered between unrelated modules; each presentation concern should have one home.

## Current practical limits

- The installed WhatsApp stack supports a button-based interactive layer through the existing helper. The HTML-widget native flow is not confirmed reliable for this installation. Treat `flowMarket` as an opt-in experimental path guarded by a runtime capability probe.
- If a command wants interactive UI, the current safe assumption is: send buttons or numbered text first, and only layer native flow where it has been verified for the live phone/backend.
