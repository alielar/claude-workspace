import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
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
            width: 340,
            height: 340,
            borderRadius: 999,
            background: "#fbf5ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 210, height: 210, borderRadius: 999, background: "#fde8dc" }} />
        </div>
      </div>
    ),
    size,
  );
}
