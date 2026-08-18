# Dev mode: jump-to-time controls

**Date:** 2026-08-18
**Revision:** 2 (after Grok review round 1)
**Goal:** Let a developer put the world at an exact time of day in one click, to inspect map
lighting, lamps, neon **and NPC placement**.
**Non-goal:** rewinding time, a new simulation speed.

## Why a simulation jump, when two time tools already exist

Two existing tools move the clock. Neither serves this goal in the running app.

**`window.siWorldSetSmokeMinute`** ([src/render/WorldScene.tsx:831](../../src/render/WorldScene.tsx))
patches `clock.absoluteMinute` and nothing else. It is registered inside an effect gated on
`window.siWorldSmokeMode !== true` ([src/render/WorldScene.tsx:693](../../src/render/WorldScene.tsx)),
so it exists only during smoke runs. It moves lighting, lamps and neon but leaves every NPC standing
where they were, and it silently desyncs `nextBasicCostMinute` from the clock.

**`devHarnessGoldenHourState`** ([src/ui/dev-harness/scenario-state.ts:62](../../src/ui/dev-harness/scenario-state.ts))
is the exact shape this plan wants — `simulateWorldInterval` with `awake: false, frameMovement:
false`, then paused. It is fixed at 17:30 and only builds a fresh harness state. It cannot move the
live world you are already looking at.

So: reuse `devHarnessGoldenHourState`'s pattern, drive it from the HUD, at any target minute.

## Preset minutes

Lighting is driven by two things: the four period buckets in `worldAtmosphere`, and the continuous
`worldSun` ([src/render/atmosphere.ts](../../src/render/atmosphere.ts)).

| Minute | Time | What lands here |
|---|---|---|
| 0 | 00:00 | night bucket, `lampMix` 1 |
| 300 | 05:00 | `SUNRISE_MINUTE`; `dawn` bucket starts; longest amber rake shadow |
| 570 | 09:30 | `day` bucket starts |
| 780 | 13:00 | peak sun: `elevation` is `sin(π·(m−300)/960)`, so it is exactly 1 at 780 |
| 1020 | 17:00 | `dusk` bucket starts; `mapEffectVisible` turns neon on |
| 1260 | 21:00 | `SUNSET_MINUTE`; `night` bucket starts; longest blue-shifted rake |

**780, not 720.** Peak elevation is the midpoint of sunrise-to-sunset, which is 780 (13:00). At 720
elevation is 0.98. The shortest *authored* shadow key is a separate constant at minute 795
([atmosphere.ts:85](../../src/render/atmosphere.ts)), so "peak sun" and "shortest shadow" are 15
minutes apart by design. The table above claims only peak sun.

Presets land on these exact minutes, so two captures are comparable. A 10x speed would need a new
value in `SimulationSpeedSchema` (`0 | 1 | 2`), which is persisted. A blind +4h lands on arbitrary
minutes and never lines up.

## Constraints accepted

**Time only moves forward.** `simulateWorldInterval` throws when the target is before the current
clock ([src/world/schedules/simulation.ts:97](../../src/world/schedules/simulation.ts)). Pressing
`09:30` at 17:00 jumps to the **next day's** 09:30 and the day counter goes up. Rewinding needs a
save reload and is out of scope.

**The jump mutates the world, not just the light.** Over a wrapped day the jump will:

- charge the daily basic cost when it crosses `economy.nextBasicCostMinute` (initially 1440),
- pay the weekly allowance when it crosses `nextAllowanceMinute`,
- start, replan or complete pending invitations and transfers,
- settle due commitments through `settleDueCommitments`, which can turn an agreed appointment into
  honoured or reneged ([src/domain/verbal-missions/commitments.ts](../../src/domain/verbal-missions/commitments.ts)).

One lighting click can therefore close a quest thread. This is a real cost, accepted for a dev tool,
and surfaced in the UI (see step 4).

**`awake: false` is still correct, but not for the reason first claimed.**
`energyDrainMinutesPerPoint` is 60 ([src/domain/economy/economy.ts:37](../../src/domain/economy/economy.ts)),
so a 16-hour awake jump costs 16 energy, not a collapse. It is still wrong to charge a developer 16
energy for looking at the map, so the jump stays `awake: false` — and that means the resulting state
is **not** one a real playthrough could reach. A dev jump is a cheat, and the plan says so rather
than claiming otherwise.

## Steps

### 1. Domain command `dev-jump-to-minute`

`src/domain/commands/types.ts` — add one variant to `DomainCommandSchema`:

```ts
CommandBaseSchema.extend({
  type: z.literal('dev-jump-to-minute'),
  toMinute: z.number().int().nonnegative(),
}).strict(),
```

`src/domain/events/types.ts` — add one variant to `DomainEventSchema`:

```ts
EventBaseSchema.extend({
  type: z.literal('dev-time-jumped'),
  fromMinute: z.number().int().nonnegative(),
  toMinute: z.number().int().nonnegative(),
  milestoneIds: z.array(z.string().min(1).max(160)),
}).strict(),
```

`src/domain/commands/reducer.ts` — add the case, modelled on `sleep-protagonist`
([reducer.ts:495](../../src/domain/commands/reducer.ts)) minus the energy restore:

```ts
case 'dev-jump-to-minute': {
  if (state.clock.pauseTokens.length > 0) throw new Error('Time jump requires a stable unpaused world.');
  if (command.toMinute <= state.clock.absoluteMinute) throw new Error('Time jump target must be in the future.');
  const simulation = simulateWorldInterval({
    state,
    toAbsoluteMinute: command.toMinute,
    toSubMinuteMilliseconds: 0,
    awake: false,
    frameMovement: false,
  });
  const event: DomainEvent = {
    ...eventBase(state, command, command.toMinute),
    type: 'dev-time-jumped',
    fromMinute: state.clock.absoluteMinute,
    toMinute: command.toMinute,
    milestoneIds: [...simulation.milestoneIds],
  };
  return settleDueCommitments(commitEvent(state, event, simulation.state));
}
```

**Schema version:** the constant is `STATE_SCHEMA_VERSION = 7`
([src/domain/state/schema.ts:30](../../src/domain/state/schema.ts)); there is no `SAVE_VERSION`.
`eventLedger` is `z.array(DomainEventSchema)` ([schema.ts:90](../../src/domain/state/schema.ts)), so
the ledger is persisted — but adding a new *variant* to a discriminated union is backward
compatible. Existing v7 saves never contain it. Do **not** bump `STATE_SCHEMA_VERSION` and do **not**
touch `ENGINE_VERSION`, which is a literal that old saves must still match. Step 5 test **11**
asserts this.

### 2. Application helper

`src/application/runtime/tick.ts` — add alongside `sleepWorld`, same shape:

```ts
export function jumpWorldToMinute(state: WorldState, toMinute: number): WorldState {
  const suffix = commandSuffix(state, `dev-jump-${toMinute}`);
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'dev-jump-to-minute',
    commandId: `command-${suffix}`,
    eventId: `event-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    toMinute,
  })).state;
}
```

### 3. Target-minute helper

Add to the existing `src/domain/clock/clock.ts`, beside `clockParts`. No new file.

```ts
export const DEV_TIME_PRESETS = [0, 300, 570, 780, 1_020, 1_260] as const;

/** Next absolute minute at `minuteOfDay`, wrapping to the following day when already past. */
export function nextMinuteOfDay(absoluteMinute: number, minuteOfDay: number): number {
  if (!Number.isSafeInteger(absoluteMinute) || absoluteMinute < 0) {
    throw new RangeError('Absolute minute must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1_439) {
    throw new RangeError('Minute of day must be a safe integer in 0..1439.');
  }
  const target = Math.floor(absoluteMinute / 1_440) * 1_440 + minuteOfDay;
  return target > absoluteMinute ? target : target + 1_440;
}
```

`> absoluteMinute` rather than `>=` means the preset you are already sitting on advances a full day
instead of throwing. The UI disables that button so it is unreachable in practice.

### 4. HUD dev drawer

`src/ui/Hud.tsx`:

- New props: `devMode: boolean`, `onDevMode: () => void`,
  `onJumpToMinute: (minuteOfDay: number) => void`, `onJumpForwardHour: () => void`,
  `jumpDisabled: boolean`.
- Put the `DEV` toggle on the **existing UI SCALE row**, after the three scale buttons. It must not
  be a new row, and it must not go in `styles.actions` (the always-visible HUD footer holding
  QUESTS / SOCIAL / SAVE / SETTINGS, [Hud.tsx:117](../../src/ui/Hud.tsx)).

  **The drawer height must not change while dev mode is off.** `clickZoomButton` opens the settings
  drawer and never closes it, so it stays open for the rest of every packaged smoke. `clickWorldTile`
  then fires a **real OS mouse event** at a screen coordinate
  ([electron/main/index.ts:882](../../electron/main/index.ts)), and the HUD has `pointerEvents: 'auto'`
  over the world. One extra drawer row makes the HUD taller, the HUD swallows the click, and the
  player never moves. This is not theoretical: a first attempt that added a separate DEV row failed
  `package-windows-x64` with `Timed out waiting for tile 15,23` in the `villa-interior` step. The
  clearance there is only tens of pixels.
- When `devMode` is true, render one extra row with `nativeID="world-ui-dev-time"`: six preset
  buttons labelled `00:00 05:00 09:30 13:00 17:00 21:00` plus `+1H`.
- Give that dev row its own style with `flexWrap: 'wrap'`. Seven buttons clip inside the 540px HUD
  at 100% `uiScale`. Do **not** add `flexWrap` to the shared `settingRow` style — VIEW and UI SCALE
  rely on it not wrapping.
- Disable the preset whose `minuteOfDay` equals `state.clock.absoluteMinute % 1_440`.
- Disable every jump button when `jumpDisabled`.
- Labels: `Jump to 17:00`, `Jump forward one hour`, `Toggle dev mode`.

Do **not** rename `Open display settings`. `clickZoomButton` in `electron/main/index.ts` finds the
SETTINGS button by that exact string and the packaged smoke fails otherwise (comment at
[src/ui/Hud.tsx:124](../../src/ui/Hud.tsx)).

**Packaged evidence:** `devMode` defaults false, so the TIME JUMP row does not render and the drawer
is exactly as tall as before. The only change to existing smoke screenshots is one `DEV` button on
the UI SCALE row. No smoke toggles `DEV`, so no captured layout shifts and no native click is
blocked.

`src/render/WorldScene.tsx`:

- `const [devMode, setDevMode] = useState(false)` — React state only. Not in the save, not in
  presentation preferences, so no schema change and no migration. It resets on reload, which is
  correct for a dev tool.
- `jumpToAbsoluteMinute` callback. The jump and both feedback writes happen **outside** the
  `setRuntime` updater, matching `purchaseSecurityReport`
  ([WorldScene.tsx:1305](../../src/render/WorldScene.tsx)). No other `WorldScene` path calls
  `setWorldFeedback` from inside an updater, and updaters must stay pure — React can call them twice.

```ts
const jumpToAbsoluteMinute = useCallback((toMinute: number) => {
  const from = runtime.worldState.clock.absoluteMinute;
  if (transitioning || runtime.worldState.clock.pauseTokens.length > 0) return;
  try {
    const jumped = jumpWorldToMinute(runtime.worldState, toMinute);
    // Pause, or the next tick moves the clock off the preset and the capture is not repeatable.
    const next = jumped.clock.selectedSpeed === 0 ? jumped : setWorldSpeed(jumped, 0);
    setRuntime((current) => ({
      movement: cancelMovement(current.movement),
      npcMovements: npcMovementState(next),
      worldState: next,
    }));
    const wrapsDay = Math.floor(toMinute / 1_440) !== Math.floor(from / 1_440);
    setWorldFeedback(wrapsDay ? 'TIME JUMPED · NEXT DAY · WORLD ADVANCED' : 'TIME JUMPED');
  } catch (error) {
    setWorldFeedback(`TIME JUMP FAILED · ${(error instanceof Error ? error.message : String(error)).toUpperCase()}`);
  }
}, [runtime.worldState, transitioning]);
```

`wrapsDay` is derived from the day index, not from which button was pressed. `+1H` at 23:30 lands at
00:30 the next day and crosses `nextBasicCostMinute`, so it must warn exactly like a preset does.

Three things this must keep:

- **`npcMovementState(next)`.** Without it the renderer keeps stale NPC tween targets and characters
  slide across the map after the snap.
- **The pause.** The goal is repeatable captures. Without `setWorldSpeed(next, 0)` the clock ticks
  off the preset immediately. `devHarnessGoldenHourState` pauses for the same reason.
- **The try/catch.** `simulateWorldInterval` throws when a schedule milestone lands on an NPC that
  is `in_transit` ([simulation.ts:215](../../src/world/schedules/simulation.ts)), which is reachable
  during a home-visit transfer. `sleep` gets away without one because beds are gated; a HUD button
  is not.

- Wire the callbacks: `onJumpToMinute` calls `jumpToAbsoluteMinute(nextMinuteOfDay(absoluteMinute,
  minuteOfDay))`; `onJumpForwardHour` calls `jumpToAbsoluteMinute(absoluteMinute + 60)`.
- `jumpDisabled={transitioning || runtime.worldState.clock.pauseTokens.length > 0}`. This is close to
  but not the same as `saveDisabled` at [WorldScene.tsx:1926](../../src/render/WorldScene.tsx), which
  also blocks on `movement.status === 'moving'`. The jump does not need that clause because it calls
  `cancelMovement` itself. A disabled button is honest; a silent early return leaves it looking live.
- Pass all five new props at the `Hud` call site
  ([WorldScene.tsx:1910](../../src/render/WorldScene.tsx)).
- Import `jumpWorldToMinute` next to `setWorldSpeed, sleepWorld, tickWorld` at
  [WorldScene.tsx:15](../../src/render/WorldScene.tsx), and `nextMinuteOfDay`/`DEV_TIME_PRESETS`
  from `src/domain/clock/clock`.

No autosave call, matching `sleep`. But a later travel, sleep or quest autosave will persist the
jumped world — see the mutation list above. That is why the HUD says so on a day wrap.

### 5. Tests

`src/domain/__tests__/dev-time-jump.test.ts` (new):

1. `nextMinuteOfDay` wraps: from 1_030 (day 1, 17:10) to preset 570 returns 2_010 (day 2, 09:30).
2. `nextMinuteOfDay` same day: from 600 to preset 1_020 returns 1_020.
3. `nextMinuteOfDay` on the preset itself wraps: from 780 to preset 780 returns 2_220.
4. `nextMinuteOfDay` rejects `minuteOfDay` of −1, 1_440, and 12.5.
5. Reducer jump lands exactly: `absoluteMinute` equals the target, `subMinuteMilliseconds` is 0.
6. Reducer 24-hour jump from `createInitialState()` does not throw, and `revision` advances. Scale
   proof is [src/world/__tests__/simulation.test.ts:132](../../src/world/__tests__/simulation.test.ts),
   a 7-day `simulateWorldInterval` with `frameMovement: false` that already passes — **not** the
   `overnight` sleep, which caps at 720 minutes ([src/domain/clock/sleep.ts:14](../../src/domain/clock/sleep.ts)).
7. Energy unchanged across a 12-hour jump — the `awake: false` guard.
8. `linda` moves to a different tile across a 12-hour jump — locks `frameMovement: false`. Name the
   NPC. Office clerks sit at the same desk at 08:00 and 20:00 under `officeSchedule`, so an
   arbitrary NPC can make this assertion fail for the wrong reason.
9. Reducer throws when `toMinute` is at or before the current minute.
10. Reducer throws when a pause token is held.
11. JSON round-trip: `WorldStateSchema.parse(JSON.parse(JSON.stringify(jumped)))` succeeds, proving
    the new event variant serialises and needs no migration.

Also add one row to the commitment-settling `test.each` at
[src/domain/verbal-missions/__tests__/commands.test.ts:336](../../src/domain/verbal-missions/__tests__/commands.test.ts)
(**not** `src/domain/__tests__/commands.test.ts`, which does not exist):

```ts
['dev-jump-to-minute', { toMinute: 600 }],
```

`toMinute` must be exactly 600. `agreementState()` starts at minute 480 with the Priya commitment due
at 600, and the test asserts `absoluteMinute` is 600. Any other target fails it.

Verification, both headless per `CLAUDE.md`:

```bash
npm run typecheck && npx jest --runInBand --runTestsByPath src/domain/__tests__/dev-time-jump.test.ts
```

Then `npm test` and `npm run check:boundaries`.

## Risks

- **The jump is an ungated cheat in the shipped HUD.** It skips days, skips commitment deadlines and
  avoids energy cost, and persists through SAVE or any later autosave. Accepted for a prototype. If
  that changes, gate the `DEV` toggle behind a build flag — not `__DEV__`, which is false in the
  Expo production export that Electron loads, so it would remove the tool from the packaged app
  where it is most wanted.
- **Music and audio.** Jumping into `night` flips the audio policy period mid-frame. Expected.
- **Milestone queue size.** A 1439-minute jump builds schedule milestones for every NPC. The 7-day
  test above already covers a far larger span.

## Rejected alternatives

- **Clock-only patch in the HUD** (the `siWorldSetSmokeMinute` approach): simpler, reversible, no
  command and no event. Rejected because it leaves every NPC frozen at the old time and silently
  desyncs `nextBasicCostMinute`. "How does the map look at 3am" with the whole cast standing in the
  street is the wrong answer. Worth building later as a separate *lighting preview* control if
  scrubbing backwards turns out to matter more than a truthful world.
- **A 10x simulation speed.** Needs a persisted enum change and still costs a minute of watching.
- **A +4h jump button.** Lands on arbitrary minutes; captures never line up.

## Out of scope

- Render-only time slider that scrubs backwards.
- Keyboard shortcut for the jump.
- Persisting `devMode` across reloads.
