import { ImageResponse } from "next/og";

/**
 * The app icon, drawn in code so there is no binary asset to keep in sync.
 * Dark tile, violet→cyan gradient ring, a bold "C".
 */
export function renderAppIcon(size: number) {
  const ring = Math.round(size * 0.08);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#06060B",
        }}
      >
        <div
          style={{
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #7C4DFF 0%, #64FFDA 100%)",
          }}
        >
          <div
            style={{
              width: size * 0.7 - ring * 2,
              height: size * 0.7 - ring * 2,
              borderRadius: "50%",
              background: "#06060B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ECECF4",
              fontSize: size * 0.34,
              fontWeight: 700,
              fontFamily: "sans-serif",
            }}
          >
            C
          </div>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
