# Halcyra audio supply list

Supply the files below as original, commercially cleared audio.

## Delivery format

- Send `48 kHz`, `24-bit` WAV masters.
- Music and ambience should be stereo.
- Footsteps and UI sounds should be mono.
- Music and ambience loops must be seamless and click-free.
- Leave at least `1 dB` of peak headroom.
- Use no lyrics, spoken words, copyrighted melodies, or uncleared samples.
- Do not compress the masters. The game build will use smaller runtime copies.

Place finished files in `assets/source/audio/` or attach them to the task.

## Music — 10 files

Keep each district track calm enough to sit behind reading and conversation.

| Filename | Title and brief | Length |
|---|---|---:|
| `music_menu.wav` | **Halcyra After Dark** — warm ocean synths, quiet mystery, clear opening identity | 60–90 sec |
| `music_sunward_day.wav` | **Sunlit Courtyard** — relaxed resort warmth, light organic percussion, no stock tropical clichés | 90–150 sec |
| `music_sunward_night.wav` | **Villas at Dusk** — intimate lounge pulse, soft bass, warm night air | 90–150 sec |
| `music_neon_day.wav` | **Crescent Waking** — restrained electronic city pulse, curious rather than aggressive | 90–150 sec |
| `music_neon_night.wav` | **Electric Alibi** — noir club energy, deep bass, sleek synth hook, never overpowering | 90–150 sec |
| `music_saffron_day.wav` | **Market Current** — friendly civic motion, hand percussion, light melodic pattern | 90–150 sec |
| `music_saffron_night.wav` | **Stalls After Sundown** — slower market theme, lantern warmth, reflective rhythm | 90–150 sec |
| `music_greywake_day.wav` | **Working Harbor** — steady industrial rhythm, muted metal color, forward motion | 90–150 sec |
| `music_greywake_night.wav` | **Last Ferry** — noir docks atmosphere, distant pulse, lonely but not bleak | 90–150 sec |
| `music_office.mp3` | Supplied office interior theme; one track day and night, loops while the player is in `west_office` | 155 sec |

## District ambience — 4 files

These are low-volume environmental beds, not songs.

| Filename | Brief | Length |
|---|---|---:|
| `ambience_sunward_loop.wav` | Soft surf, palms, fountain water, distant courtyard voices | 60–120 sec |
| `ambience_neon_loop.wav` | City hum, ventilation, sparse traffic, distant muffled club bass | 60–120 sec |
| `ambience_saffron_loop.wav` | Market murmur, cloth movement, distant cookware, open-air breeze | 60–120 sec |
| `ambience_greywake_loop.wav` | Harbor water, wind, metal creaks, distant machinery and ferry activity | 60–120 sec |

## Footsteps — 15 files

Make three natural variations for each surface. Each sound should be dry and short.

- `footstep_sand_01.wav` through `footstep_sand_03.wav`
- `footstep_stone_01.wav` through `footstep_stone_03.wav`
- `footstep_asphalt_01.wav` through `footstep_asphalt_03.wav`
- `footstep_wood_01.wav` through `footstep_wood_03.wav`
- `footstep_indoor_01.wav` through `footstep_indoor_03.wav`

Target length: `0.08–0.30 sec` each.

## Interface and world sounds — 12 files

Keep these soft, tactile, and short. Avoid loud mobile-game chimes.

| Filename | Brief |
|---|---|
| `sfx_ui_press_01.wav` | Small soft press |
| `sfx_ui_press_02.wav` | Alternate soft press |
| `sfx_ui_confirm.wav` | Warm confirmation |
| `sfx_ui_cancel.wav` | Muted back or cancel sound |
| `sfx_panel_open.wav` | Short paper or card movement |
| `sfx_panel_close.wav` | Reverse paper or card movement |
| `sfx_journal_entry.wav` | Brief pencil, stamp, or caseboard accent |
| `sfx_save_complete.wav` | Quiet two-note save confirmation |
| `sfx_relationship_positive.wav` | Warm social change accent |
| `sfx_relationship_negative.wav` | Low restrained social consequence accent |
| `sfx_door_open.wav` | Light exterior or interior door open |
| `sfx_door_close.wav` | Light exterior or interior door close |

Target length: `0.05–1.2 sec` each.

## Already present — do not supply

The game already has four generated, captioned conversation cues:

- `greeting.wav`
- `laugh.wav`
- `sigh.wav`
- `consequence.wav`

## Not needed yet

Do not make separate cars, arcade machines, gulls, ferry horns, crowd loops, or weather sounds yet. The four ambience beds cover this pass. Add isolated world sounds only after the first in-game mix shows a real gap.
