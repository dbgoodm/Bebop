/**
 * Token deltas applied on top of themes imported from the Claude Design project.
 *
 * `crewThemes.ts` is generated, so refinements made here in the app would be
 * lost on the next import. Keeping them as an explicit override layer means the
 * generated file stays a faithful copy of the design source, and every local
 * change to a theme is visible in one place.
 */
export const THEME_VAR_OVERRIDES: Record<string, Record<string, string>> = {
  // Space Cowboy keeps its own palette, but takes the poster study's two best
  // pieces: the Swordfish crossing the frame, and smoke drawn as a curling
  // ribbon instead of a drifting cloud.
  'space-cowboy-v2': {
    // The old horizontal streak is retired in favour of the corner-to-corner
    // climb, which crosses in front of content so it is actually seen.
    '--op-ship': '0',
    '--op-ascent': '1',
    '--ascent-col': '#d33a2c',
    '--trail-col': 'rgba(236,228,207,.5)',
    // Angle and distance are measured from the viewport at runtime, so the
    // crossing stays corner-to-corner at any window size.
    '--ascent-x': '0%',
    '--ascent-y': '0%',
    '--ascent-dur': '15s',

    // Drawn smoke, warm against the navy.
    '--op-smoke': '1',
    '--smoke-stroke': 'rgba(233,226,206,.5)',
    '--ember-col': '#ff7a45',

    // The design project gives Space Cowboy fully round bars. Rounded caps read
    // as soft here, which fights a theme built on flat fills and hairlines, so
    // the meter is squared off: flat amber bars with a Swordfish-red peak cap.
    // The red is the theme's one accent, the same colour as the slate corner
    // marks and the ship, so the meter reads as part of the same drawing.
    '--bar-r': '0px',
    '--bar-cap': '#d33a2c',
    '--bar-cap-h': '2px',
  },
};
