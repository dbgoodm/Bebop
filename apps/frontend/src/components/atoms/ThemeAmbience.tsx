import { memo, useEffect, useState, type CSSProperties } from 'react';

/**
 * Ambient texture layers driven entirely by theme tokens.
 *
 * Every layer is always mounted and every layer is controlled by an opacity
 * token (`--op-stars`, `--op-smoke`, …) that defaults to `0`. A theme opts into
 * a layer by raising its opacity, so adding atmosphere to a theme never means
 * touching this file.
 *
 * All layers are `pointer-events: none` and sit behind the app content. Nothing
 * here re-samples the backdrop — on WebKitGTK a `backdrop-filter` over
 * scrolling content is expensive enough to tear.
 */
/** One streak-of-light ship, its path set by which `bb-ship*` keyframe it runs. */
function Ship({ animationName, duration }: { animationName: string; duration: string }) {
  return (
    <div
      className="absolute left-0 top-0"
      style={{ width: 3, height: 3, animation: `${animationName} ${duration} linear infinite` }}
    >
      <div
        className="absolute inset-0"
        style={{
          borderRadius: 9999,
          background: '#ffd9c4',
          boxShadow: '0 0 6px 1.5px rgba(255,154,108,.85), 0 0 14px 4px rgba(211,58,44,.3)',
        }}
      />
      <div
        className="absolute"
        style={{
          top: 1,
          right: 3,
          width: 90,
          height: 1,
          borderRadius: 9999,
          background:
            'linear-gradient(90deg, rgba(211,58,44,0) 0%, rgba(255,154,108,.4) 82%, rgba(255,217,196,.7) 100%)',
        }}
      />
    </div>
  );
}

function ThemeAmbienceImpl() {
  // A fixed angle cannot be corner-to-corner at every window size: too shallow
  // and the craft leaves through the top, too steep and it leaves through the
  // side. Derive the rake and the travel distance from the actual viewport.
  const [flight, setFlight] = useState(() => flightFor(1440, 900));

  useEffect(() => {
    const measure = () => setFlight(flightFor(window.innerWidth, window.innerHeight));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        className="win-round pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {/* Ambient colour wash */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'var(--orb-g, transparent)' }}
        />

        {/* Starfield — slow parallax drift plus a longer twinkle. Same fix as
          the signal tear below: the gating opacity has to live on a wrapper,
          not on the element bb-twinkle's own opacity keyframes are running
          on, or the twinkle overrides the gate and stars show up on every
          theme regardless of --op-stars. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ opacity: 'var(--op-stars, 0)' }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(1px 1px at 24px 38px, #ffffff, transparent), radial-gradient(1px 1px at 168px 96px, #cfe0ff, transparent), radial-gradient(1.6px 1.6px at 96px 214px, #ffffff, transparent)',
              backgroundSize: '300px 300px, 380px 380px, 460px 460px',
              animation: 'bb-stars 190s linear infinite, bb-twinkle 7s ease-in-out infinite',
            }}
          />
        </div>

        {/* Surface grain / dot texture — also doubles as a single positioned
          watermark shape when a theme sets --tex-repeat to no-repeat, rather
          than tiling. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 'var(--tex-op, 0)',
            backgroundImage: 'var(--tex, none)',
            backgroundSize: 'var(--tex-size, 3px 3px)',
            backgroundRepeat: 'var(--tex-repeat, repeat)',
            backgroundPosition: 'var(--tex-position, 0 0)',
          }}
        />

        {/* Cigarette smoke.
          Watched frame by frame: the trail is never the same shape twice, it is
          several faint overlapping strands rather than one line, it loops and
          hooks as often as it zigzags, and it is soft — opacity varies along
          each strand and it spreads into separate wisps near the top.
          So: several independently generated irregular paths, each rising on
          its own clock and fading in and out, which hides the loop point and
          means the composite effectively never repeats. */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-full w-[300px] overflow-hidden"
          style={{ opacity: 'var(--op-smoke, 0)' }}
        >
          <svg
            viewBox="0 0 160 560"
            preserveAspectRatio="xMidYMax meet"
            className="absolute bottom-4 left-0"
            style={{ width: 190, height: '92%', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="bb-smoke-fade" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="white" stopOpacity="0.35" />
                <stop offset="12%" stopColor="white" stopOpacity="1" />
                <stop offset="55%" stopColor="white" stopOpacity="0.8" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <mask id="bb-smoke-mask">
                <rect x="-80" y="-200" width="320" height="820" fill="url(#bb-smoke-fade)" />
              </mask>
            </defs>

            <g mask="url(#bb-smoke-mask)">
              {SMOKE_STRANDS.map((strand) => (
                <g
                  key={strand.id}
                  style={{
                    animation: `bb-smoke-drift ${strand.dur} linear ${strand.delay} infinite`,
                  }}
                >
                  {/* soft body — wide, blurred, barely there */}
                  <path
                    d={strand.d}
                    fill="none"
                    stroke="var(--smoke-stroke, rgba(233,226,206,.5))"
                    strokeWidth={strand.weight * 3.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={strand.opacity * 0.3}
                    style={{ filter: `blur(${strand.blur}px)` }}
                  />
                  {/* the visible thread inside it */}
                  <path
                    d={strand.d}
                    fill="none"
                    stroke="var(--smoke-stroke, rgba(233,226,206,.5))"
                    strokeWidth={strand.weight}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={strand.opacity}
                    style={{ filter: 'blur(.35px)' }}
                  />
                </g>
              ))}
            </g>
          </svg>

          <div
            className="absolute"
            style={{
              left: 74,
              bottom: 18,
              width: 5,
              height: 5,
              borderRadius: 9999,
              background: 'var(--ember-col, #ff7a45)',
              animation: 'bb-ember 3.2s ease-in-out infinite',
            }}
          />
        </div>

        {/* Background ships — anonymous traffic, not the Swordfish (that's the
          corner-to-corner --op-ascent climb below). Each one is far enough off
          to read as a streak of light, absent for most of its own cycle, and
          each crosses on its own line at its own pace so they don't read as
          one ship on a loop. */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ opacity: 'var(--op-ship, 0)' }}
        >
          <Ship animationName="bb-ship" duration="46s" />
          <Ship animationName="bb-ship-2" duration="58s" />
          <Ship animationName="bb-ship-3" duration="63s" />
        </div>

        {/* Ringed planet, drawn as flat screen-print shapes. The ring reads only
          if it passes behind the body and in front of it, so the back arc is
          drawn first, then the sphere, then the front arc clipped to its
          lower half. A rotated border-radius cannot do this. */}
        <div
          className="pointer-events-none absolute"
          style={{
            opacity: 'var(--op-planet, 0)',
            top: 'var(--planet-y, -6%)',
            right: 'var(--planet-x, -4%)',
            width: 'var(--planet-size, 340px)',
          }}
        >
          <svg viewBox="0 0 200 200" style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <clipPath id="bb-ring-front">
                <rect x="0" y="100" width="200" height="100" />
              </clipPath>
            </defs>
            <g transform="rotate(-19 100 100)">
              {/* ring, behind the body */}
              <ellipse
                cx="100"
                cy="100"
                rx="92"
                ry="26"
                fill="none"
                stroke="var(--ring-col, #7fa3ad)"
                strokeWidth="3"
                opacity="0.75"
              />
              {/* body */}
              <circle cx="100" cy="100" r="62" fill="var(--planet-col, #93ac96)" />
              {/* a single flat terminator band, the way a print would separate it */}
              <path
                d="M100 38a62 62 0 0 1 0 124 62 62 0 0 0 0-124z"
                fill="var(--planet-lo, #6d8878)"
                opacity="0.55"
              />
              {/* ring, in front of the body */}
              <ellipse
                cx="100"
                cy="100"
                rx="92"
                ry="26"
                fill="none"
                stroke="var(--ring-col, #7fa3ad)"
                strokeWidth="3"
                clipPath="url(#bb-ring-front)"
              />
            </g>
          </svg>
        </div>

        {/* Contrail ribbons sweeping across the top of the frame */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ opacity: 'var(--op-ribbons, 0)', height: '46%' }}
        >
          {RIBBONS.map((ribbon, index) => (
            <div
              key={index}
              className="absolute"
              style={{
                left: '-12%',
                right: '-12%',
                top: ribbon.top,
                height: ribbon.thickness,
                borderRadius: '9999px',
                background: `var(--ribbon-col, rgba(196,190,166,.5))`,
                opacity: ribbon.opacity,
                ['--ribbon-rot' as string]: ribbon.rotate,
                filter: 'blur(.4px)',
                animation: `bb-ribbon ${ribbon.dur} ease-in-out ${ribbon.delay} infinite alternate`,
              }}
            />
          ))}
        </div>

        {/* CRT refresh band */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ opacity: 'var(--op-scan, 0)' }}
        >
          <div
            className="absolute left-0 right-0"
            style={{
              height: 90,
              background:
                'linear-gradient(180deg, rgba(89,242,107,0) 0%, rgba(89,242,107,.10) 50%, rgba(89,242,107,0) 100%)',
              animation: 'bb-scan 9s linear infinite',
            }}
          />
        </div>

        {/* Occasional signal tear. The gating opacity has to live on a wrapper,
          not on the animated element itself — bb-glitch's own keyframes set
          opacity too, and a running animation always wins over a plain style
          value for whatever property it drives. Gate and animation on the
          same element meant this ran on every theme regardless of
          --op-glitch, which is the bug that was reported. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ opacity: 'var(--op-glitch, 0)' }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, transparent 42%, rgba(255,85,51,.35) 42%, rgba(63,216,232,.35) 45%, transparent 45%)',
              animation: 'bb-glitch 11s steps(1,end) infinite',
            }}
          />
        </div>
      </div>

      {/* The craft sits behind page content, so it reads as something crossing the
        sky beyond the window rather than over the UI. It is only glimpsed where
        the layout leaves gaps — which is the intent. */}
      <div
        aria-hidden="true"
        className="win-round pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={
          {
            opacity: 'var(--op-ascent, 0)',
            '--ascent-angle': `${flight.angle}deg`,
            '--ascent-travel': `${flight.travel}px`,
            '--ascent-start': `${flight.start}px`,
          } as CSSProperties
        }
      >
        <div
          className="absolute"
          style={{
            left: 'var(--ascent-x, 0%)',
            bottom: 'var(--ascent-y, 0%)',
            width: 2,
            height: '30%',
            transformOrigin: 'bottom center',
            animation: 'bb-ascend var(--ascent-dur, 17s) cubic-bezier(.42,.04,.58,.96) infinite',
          }}
        >
          <div
            className="absolute inset-x-0"
            style={{
              top: 14,
              bottom: '-260vh',
              background:
                'linear-gradient(180deg, var(--ascent-col, #d33a2c) 0%, var(--trail-col, rgba(236,228,207,.5)) 10%, transparent 62%)',
            }}
          />
          <div className="absolute" style={{ left: '50%', top: 0, transform: 'translateX(-50%)' }}>
            <svg width="24" height="17" viewBox="0 0 26 18" fill="var(--ascent-col, #d33a2c)">
              <path d="M13 0 15.1 7.4 24 9.9l-.9 2.5-8.4-1.7.7 5.2-2.4 1.9-2.4-1.9.7-5.2-8.4 1.7L2 9.9l8.9-2.5z" />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}

// Takes no props, so this guarantees React skips re-rendering it (and diffing
// its fairly large always-mounted subtree) on every unrelated re-render of
// whatever it's mounted under — including the frequent playback-state ticks
// (volume drags, position updates) that would otherwise compete with these
// CSS animations for main-thread time on every single frame.
export const ThemeAmbience = memo(ThemeAmbienceImpl);

const RIBBONS = [
  { top: '14%', thickness: '3px', rotate: '-7deg', opacity: 0.55, dur: '19s', delay: '0s' },
  { top: '21%', thickness: '2px', rotate: '-4deg', opacity: 0.38, dur: '23s', delay: '1.4s' },
  { top: '30%', thickness: '4px', rotate: '-9deg', opacity: 0.28, dur: '27s', delay: '2.9s' },
  { top: '38%', thickness: '2px', rotate: '-3deg', opacity: 0.2, dur: '21s', delay: '4.2s' },
];

// A single ribbon described in three passes so it can taper. The switchbacks
// are deliberately angular — the show's smoke folds, it does not spiral.
/** Deterministic PRNG, so the strands are irregular but stable across renders. */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One irregular rising strand.
 *
 * Walks upward in uneven steps, wandering further off-centre as it climbs (the
 * trail is tight at the cigarette and wild at the top), and occasionally throws
 * a loop instead of a plain curve — the hooks and curls the show draws.
 */
function smokeStrand(seed: number, baseX: number) {
  const rand = seeded(seed);
  const steps = 9;
  const top = 30;
  const bottom = 545;
  let x = baseX;
  let y = bottom;
  let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;

  for (let i = 0; i < steps; i += 1) {
    const progress = i / (steps - 1);
    const rise = (bottom - top) / steps;
    // Amplitude grows with height, so the base stays tight and the top wanders.
    const spread = 8 + progress * 46;
    const nextY = y - rise * (0.7 + rand() * 0.6);
    const nextX = baseX + (rand() - 0.5) * spread * 2;

    if (rand() < 0.26 && progress > 0.25) {
      // A loop: control points overshoot past the endpoint and cross back.
      const loop = 20 + rand() * 26;
      const dir = rand() < 0.5 ? -1 : 1;
      d +=
        ` C ${(x + dir * loop).toFixed(1)} ${(y - rise * 0.2).toFixed(1)},` +
        ` ${(nextX + dir * loop * 1.5).toFixed(1)} ${(nextY - rise * 0.1).toFixed(1)},` +
        ` ${nextX.toFixed(1)} ${nextY.toFixed(1)}`;
    } else {
      const c1 = x + (rand() - 0.5) * spread * 2.2;
      const c2 = nextX + (rand() - 0.5) * spread * 2.2;
      d +=
        ` C ${c1.toFixed(1)} ${(y - rise * 0.35).toFixed(1)},` +
        ` ${c2.toFixed(1)} ${(nextY + rise * 0.35).toFixed(1)},` +
        ` ${nextX.toFixed(1)} ${nextY.toFixed(1)}`;
    }
    x = nextX;
    y = nextY;
  }
  return d;
}

// Durations are deliberately not multiples of one another, so the strands drift
// out of phase and the column never settles into a recognisable pattern.
const SMOKE_STRANDS = [
  { id: 0, seed: 9174, baseX: 76, weight: 1.9, opacity: 0.5, blur: 2.4, dur: '11.3s', delay: '0s' },
  {
    id: 1,
    seed: 40213,
    baseX: 74,
    weight: 1.4,
    opacity: 0.34,
    blur: 3.1,
    dur: '15.7s',
    delay: '-4.1s',
  },
  {
    id: 2,
    seed: 7788,
    baseX: 78,
    weight: 2.2,
    opacity: 0.28,
    blur: 2.0,
    dur: '19.1s',
    delay: '-8.6s',
  },
  {
    id: 3,
    seed: 60551,
    baseX: 73,
    weight: 1.1,
    opacity: 0.22,
    blur: 3.6,
    dur: '13.9s',
    delay: '-2.3s',
  },
  {
    id: 4,
    seed: 23094,
    baseX: 79,
    weight: 1.6,
    opacity: 0.18,
    blur: 4.2,
    dur: '23.4s',
    delay: '-11.2s',
  },
].map((strand) => ({ ...strand, d: smokeStrand(strand.seed, strand.baseX) }));

/**
 * Rake and distance for a corner-to-corner crossing.
 *
 * The craft travels along its own rotated Y axis, so the angle from vertical
 * must equal the angle of the viewport diagonal for it to leave through the
 * opposite corner rather than the top or the side.
 */
export function flightFor(width: number, height: number) {
  const angle = (Math.atan2(width, height) * 180) / Math.PI;
  const diagonal = Math.hypot(width, height);
  return {
    angle: Number(angle.toFixed(1)),
    // A margin either side so it enters and leaves fully off-frame.
    travel: Math.round(diagonal + 260),
    start: 160,
  };
}
