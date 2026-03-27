# FE0 Modular Structure

## Entry Layer

- index.html: page skeleton, component mounting points, shared script loading order.
- app.js: root composition and module wiring only.
- server.js: backend bootstrap and handler registration only.

## Frontend Composition

- modules/viewModels.js: panel title/card mapping and side button view models.
- modules/uiActions.js: UI-level guarded actions such as safe deploy and minified card click handling.
- modules/formatters.js: ability/support text formatting helpers.

## State Layer

- modules/state.js: state aggregation entry; merges all state slices into the public state object.
- modules/state/myAreas.js: local board areas.
- modules/state/opponentAreas.js: remote board areas.
- modules/state/uiState.js: panel/full-image/draw-animation UI state.
- modules/state/interactionState.js: drag, hover, undo interaction state.
- modules/state/gameState.js: phase, combat, turn, cost-usage state.
- modules/state/networkState.js: socket initialization.

## Rules And Engine Layer

- modules/rules.js: phase legality, deploy cost/color checks, faction info lookup.
- modules/engine/combatEngine.js: combat winner and attacker ownership pure functions.
- modules/engine/phaseEngine.js: phase order, phase labels, phase advancement pure functions.

## Command / Effect Layer

- modules/commands/turnCommands.js: turn-state mutations such as beginning-phase reset and untap.
- modules/effects/socketEffects.js: turn-related socket emits.
- modules/effects/cardSocketEffects.js: card-operation socket emits.

## Card Operations

- modules/cardOps.js: card operation facade that composes area commands and combat commands.
- modules/cardOps/areaCommands.js: move, draw, undo, reset, and sync-data logic.
- modules/cardOps/combatCommands.js: initiate attack, untap card, resolve combat.

## Input / Turn / Socket Layer

- modules/dragDrop.js: pointer and touch interaction flow.
- modules/turnManagement.js: turn orchestration built on phase engine, commands, and effects.
- modules/socketHandler.js: frontend socket composition entry.
- modules/socket/opponentAreaStore.js: remote area add/remove helpers.
- modules/socket/registerStateListeners.js: frontend state-sync listeners.
- modules/socket/registerBattleListeners.js: frontend battle listeners.

## Shared Protocol Layer

- shared/socketEvents.js: single source of truth for frontend/backend socket event names.

## Backend Socket Layer

- server/socket/connectionRegistry.js: player labels and structured log helpers.
- server/socket/registerGameplayHandlers.js: draw, move, bond flip, and general gameplay sync.
- server/socket/registerBattleHandlers.js: battle sync and merged combat log handling.
- server/socket/registerSyncHandlers.js: full-state sync and reset handling.
- server/socket/registerTurnModeHandlers.js: phase log, turn end, and dev mode sync.

## UI Components

- components/BattleRow.js: unified battlefield row.
- components/BondStrip.js: bond strip display and interaction.
- components/HandStrip.js: hand display and touch integration.
- components/DeckWidget.js: deck draw widget.
- components/SidePanelButtons.js: side-panel button groups.
- components/TopControlBar.js: phase, cost, undo, reset, and mode controls.
- components/CombatOverlay.js: combat overlay panel.
- components/RegionPanel.js: generic card region modal.
- components/CardDetailModal.js: selected card detail modal.
- components/OppHandPanel.js: opponent hand panel.
- components/OppDeckPanel.js: opponent deck panel.

## Development Commands

- npm start: start server on port 3000.
- npm run start:3001: start server on port 3001.
- npm run check:structure: verify critical files, exports, and shared event wiring.
- npm run check:engine: verify pure combat and phase engine behavior.
- npm run check:rules: verify rule engine behavior for phase, cost, and color checks.
- npm test: run all current checks.

## Current Architecture Direction

- Keep app.js and server.js as composition roots, not logic dumps.
- Prefer pure functions in engine/ for rule-sensitive behavior.
- Route state mutations through commands/ or focused modules when possible.
- Route socket side effects through effects/ or socket registrars instead of scattering raw event strings.
- Keep shared/socketEvents.js as the single event-name source for both browser and Node.
