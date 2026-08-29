/**
 * <SvgDefs /> — shared SVG gradient definitions.
 * Rendered once at root level; referenced by id throughout the app.
 *
 * Available IDs:
 *   ccGradStroke  — horizontal violet→cyan (for strokes)
 *   ccGradFill    — vertical violet→transparent (for fills)
 *   ccGradFillCyan — vertical cyan→transparent (for fills)
 *   ccRingGrad    — diagonal violet→cyan (for rings/circles)
 */

export function SvgDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: "absolute", overflow: "hidden" }}
    >
      <defs>
        {/* Horizontal stroke gradient: violet → cyan */}
        <linearGradient id="ccGradStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#7C4DFF" />
          <stop offset="100%" stopColor="#64FFDA" />
        </linearGradient>

        {/* Vertical fill gradient: violet → transparent */}
        <linearGradient id="ccGradFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7C4DFF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" />
        </linearGradient>

        {/* Vertical fill gradient: cyan → transparent */}
        <linearGradient id="ccGradFillCyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#64FFDA" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#64FFDA" stopOpacity="0" />
        </linearGradient>

        {/* Diagonal ring gradient: violet → cyan */}
        <linearGradient id="ccRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#7C4DFF" />
          <stop offset="100%" stopColor="#64FFDA" />
        </linearGradient>
      </defs>
    </svg>
  );
}
