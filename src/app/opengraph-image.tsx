import { ImageResponse } from "next/og";
import { SITE } from "@/config/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card is the instrument face, matching the application's visual language. */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0e1118",
          color: "#eef1f6",
          padding: 72,
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: "#78839a" }}>
            post-quantum exposure desk
          </div>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1 }}>
            Know which public keys an adversary can already harvest.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", height: 6, background: "#2c3547" }}>
            <div style={{ width: "42%", background: "#ff6b7d" }} />
            <div style={{ width: "26%", background: "#e0a33c" }} />
            <div style={{ width: "18%", background: "#a98cf0" }} />
            <div style={{ width: "14%", background: "#4fc38a" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}>
            <span style={{ color: "#ff6b7d" }}>RSA-2048 &middot; Shor exposed</span>
            <span style={{ color: "#58b6e6" }}>measured off the TLS wire</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#78839a" }}>
            <span>{SITE.name} &middot; MIT licensed</span>
            <span>github.com/aniruddhaadak80/shorwatch</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}