import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** A plate on terracotta. Generated at build time, so no binary asset to maintain. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#c2410c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 999,
            background: "#fbf5ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 74, height: 74, borderRadius: 999, background: "#fde8dc" }} />
        </div>
      </div>
    ),
    size,
  );
}
