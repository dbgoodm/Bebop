# Bebop — Design

Bebop is a local-first, hi-fi music **library manager** for Linux, not just a
player. It is a Tauri desktop app: a Rust backend owning playback, catalog and
metadata, and a React + TypeScript frontend.

This document is the design brief. It records what the interface is trying to be
and the vocabulary it is built from, so that design work done elsewhere lands on
the real thing rather than a lookalike.

---

## Product stance

- **Local-first.** The library on disk is the source of truth. Nothing is
  fabricated: no invented lyrics, biographies, provider IDs or availability.
- **Ownership over access.** The user owns these files. The interface should
  make the collection feel substantial, inspectable, and theirs.
- **Audiophile-literal.** Format, bit depth, sample rate, dynamic range and
  whether playback is bit-perfect are first-class, always visible, never
  rounded off or prettified into meaninglessness.
- **Manager, not just player.** Tag editing, library health, duplicate and
  quality management are core surfaces, in the spirit of Mp3tag.
- **Offline by default.** Online lookups (MusicBrainz, Last.fm, lyrics) enrich
  a local cache. Once cached, the UI never needs the network to render.

---

## Surfaces

| Surface | Purpose |
| --- | --- |
| **Home** | Listening data first — stats, continue listening, rediscover. No marketing header. |
| **Library** | Artists / Albums / Tracks / Genres / Playlists. The main working surface. |
| **Artist** | Local discography beside cached remote discography, top local tracks. |
| **Album** | Unified tracklist: local tracks lit, non-local dimmed and clearly labelled. |
| **Discover** | Not yet built. Currently an honest placeholder. |
| **Settings** | Category rail: Audio, Appearance, Library, Metadata & Tags, Online Presence, Updates. |
| **Now Playing bar** | Persistent transport. Plain seek bar; spectrum as a full-height bed behind content. |
| **Fullscreen Now Playing** | Vinyl + artwork, synced lyrics, and a floor-to-high spectrum. |

**Navigation rule.** Artist and album pages belong to Library, never Discover.
Back from an album returns to the artist it was opened from; back from an
artist returns to Library.

---

## Local vs. remote

The catalog unifies local files with cached MusicBrainz metadata. Every entity
carries two independent facts, and the UI must never conflate them:

- **Provenance** — `local`, `remote`, or `both`
- **Availability** — `in-library` or `not-local`

Availability is derived from actual local tracks, never from provider data.
A release the user does not own is visible and inspectable, labelled
**Not Local**, and exposes no Play or Queue action.

---

## Visual system

### Type

Interface text is condensed and confident; metadata is monospaced. The type
ramp in use: `10px` micro-labels (uppercase, letter-spaced `0.18em`),
`11–12px` body and table text, `13–15px` titles, `22–44px` display.

Monospace is not decoration — it marks machine-truth: durations, formats,
sample rates, counts, paths, IDs.

### Colour

Themes supply every colour. No component hardcodes a hue. The token set:

```
bgCanvas  bgCanvasGradient  bgCard  bgSurface
borderColor  borderAccent  cardGradient
primary  primaryHover  secondary  accentTertiary  accentGlow
textPrimary  textMuted
visualizerPrimary  visualizerSecondary
waveformPlayedTop  waveformPlayedBot  waveformUnplayedTop  waveformUnplayedBot
```

`visualizerPrimary` defaults to white; each theme tints it.

### Density

Desktop-first, information-dense, but never cramped. Content spans up to
`1800px` — wide displays should be used, not letterboxed. Grids sit at 4–6
columns; the artist page splits discography and tracks 8/4.

---

## Themes

Themes are a first-class feature and a deliberate Easter egg: the four stock
themes are the **Bebop crew**.

| Theme | Character | Register |
| --- | --- | --- |
| **Space Cowboy** | Spike | Retro-noir. Smoke, star drift, one distant red streak. Clipped corners, hairline borders, flat fills. |
| **Queen of Hearts** | Faye | Velvet and casino gold. Gold inlay, soft radii, gradient fills, diamond handles. |
| **Black Dog** | Jet | Industrial. Brushed metal, rivets, bevels, segmented meters, no seek handle. |
| **Radical Prodigy** | Ed | CRT terminal. Scanlines, irregular radii, deliberate tilt, blobby handles. |

### A theme is more than colour

This is the point that matters. A theme controls **component geometry** as well
as palette, so themes read as genuinely different interfaces rather than
recolours:

```
button.shape     square · pill · clipped · beveled · irregular
button.fill      flat · gradient · outline · inset
border.weight    hairline · 1px · 2px · heavy
radius           per-corner values, or a preset
control.handle   round · square · diamond · blob · none
tilt             degrees, for deliberately imperfect themes
texture          none · starfield · scanline · grain · velvet · brushed
motion           calm · standard · snappy
typography       display + body + mono families
```

### Community authoring

Themes must be authorable by people who do not write CSS.

- A theme is a **plain JSON document**, not code — droppable into a themes
  folder, shareable as one file, forkable.
- A **visual editor** writes those fields, with live preview. No code required.
- **Custom CSS is an optional escape hatch**, appended after tokens, for
  authors who want to go further. Never a requirement.

The token vocabulary is therefore the ceiling on what themes can express, and
getting it right matters more than the editor UI.

---

## Motion

Motion is functional and per-theme. Ambient texture animates slowly enough to
read as atmosphere, never as activity. Restraint is the default: one
well-orchestrated effect beats scattered micro-interactions.

**Performance is a design constraint, not an afterthought.** The app runs on
WebKitGTK, where `backdrop-filter` over scrolling content and per-element
canvas shadows are expensive enough to visibly tear. Prefer opaque surfaces,
batched canvas drawing, and effects that do not re-sample the backdrop.

---

## The visualizer

A **peak-hold spectrum analyser**, replacing the earlier Monstercat style.

- Bars track the current band level: fast attack, gravity decay.
- A cap rides above each bar holding the recent maximum. A new peak moves the
  cap **instantly**; it then holds (~420 ms) and falls at a **constant linear
  rate**. The cap never eases upward — that snap is the whole character.
- Bars are **thin** (2–4px). Caps are 2–3px.
- White by default, tinted per theme.
- In the Now Playing bar it is a full-height bed behind the content at low
  opacity, not a short strip.
- Fullscreen extends it floor-to-high across the full width, with optional
  particles on transients.

---

## Seek bars

- **Now Playing bar and fullscreen use a plain seek bar.** A waveform is
  illegible at that height and reads as noise.
- A **waveform scrubber** is appropriate only where it is given real height,
  and must be drawn from decoded peaks — never a hash of the title — so a quiet
  intro reads as quiet.

---

## Song DNA

Locally computed per track, with no network: `bpm`, `musical_key`,
`loudness_db`, `energy`, `spectral_centroid_hz`, `spectral_rolloff_hz`,
`dynamic_range_db`.

These, plus catalog facts and listening history, are the vocabulary for
filtering and playlist generation — expressed to the user as tags rather than
raw numbers: energy, tempo, brightness, dynamics, key, era, genre, format,
familiarity.

Generated playlists are framed by **occasion and mood** — Mellow, Late Night,
Driving, Workout, Focus — not by restating what Home already shows.

---

## Copy

- Plain, specific, unhurried. No marketing voice.
- Never claim something is available, matched or verified unless it is.
- Errors name the failing operation and its cause. A generic apology is a bug.
- Empty states say what to do next, in the active theme's voice.

---

## Non-goals

- Not an AI-powered music service.
- Not a streaming client. Remote metadata is informational; it never plays.
- Not a mobile-first app. Desktop is the target; a companion app is long-term.
