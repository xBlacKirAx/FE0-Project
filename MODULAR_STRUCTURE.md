# FE0 Frontend Modular Structure

## Entry

- index.html: only keeps page skeleton and component tags.
- app.js: root composition, state wiring, computed view models, component registry.

## Core Logic Modules

- modules/state.js: reactive game state and defaults.
- modules/rules.js: rule checks and faction helpers.
- modules/cardOps.js: card movements and area operations.
- modules/dragDrop.js: drag/touch interactions and attack drop handling.
- modules/turnManagement.js: phase transitions and turn-level behavior.
- modules/socketHandler.js: multiplayer sync events.

## UI Components

- components/BattleRow.js: unified battlefield row for enemy and player rows.
- components/BondStrip.js: bond area strip and face-down/face-up rendering.
- components/HandStrip.js: hand cards strip with touch handlers.
- components/DeckWidget.js: floating deck draw widget.
- components/SidePanelButtons.js: reusable left/right side circular panel buttons.
- components/TopControlBar.js: phase control, cost, reset, undo, and mode toggle bar.
- components/CombatOverlay.js: battle animation overlay panel.
- components/RegionPanel.js: cards-in-region modal panel.
- components/CardDetailModal.js: selected card detail and actions modal.

## Refactor Direction

- Keep index.html as declarative layout only.
- Move mapping logic and presentational branching to app.js computed outputs.
- Add new UI blocks as components under components/ with function props for actions.
