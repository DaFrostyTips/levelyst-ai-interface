# Levelyst UI/UX Audit Checklist (Strict Gate)

Release gate: all **P0** and **P1** checks must pass.

## P0 (Block Release)
- [ ] Keyboard-only core loop works: open project -> add/select module -> simulate.
- [ ] Focus visibility is clear on custom controls, panel controls, canvas tools, and command palette rows.
- [ ] Critical text remains readable at default zoom (status, CTA labels, modal actions).
- [ ] Blocking states are explicit (credits exhausted, missing dependencies, no compatible modules).

## P1 (Block Release)
- [ ] Command palette opens with `Cmd/Ctrl+K` and executes core actions.
- [ ] Disabled commands show reason text (e.g., simulate blocked by dependencies).
- [ ] First-run coach marks appear once and can be dismissed/reopened via help.
- [ ] `?` help overlay opens and quick-jumps to target areas.
- [ ] Selection context rail updates with node/group/section context.
- [ ] Terminology is consistent across Hub, Blueprint, Copilot, Timeline, and Canvas.
- [ ] Ambient motion is readable and reduced during simulate/blueprint states.

## P2 (Track, Non-Blocking)
- [ ] Microcopy refinement pass.
- [ ] Additional command palette actions.
- [ ] Secondary animation polish.
- [ ] Enhanced empty-state illustrations.

## Validation Scenarios
- [ ] Desktop regression pass (dock/resize/minimap/auto-arrange/grouping/blueprint/simulate).
- [ ] Mobile core pass (workspace switch, prompt flow, simulate, timeline access).
- [ ] Reduced motion pass (`prefers-reduced-motion`).
- [ ] Contrast spot-check for cyan/purple low-opacity text and badges.
