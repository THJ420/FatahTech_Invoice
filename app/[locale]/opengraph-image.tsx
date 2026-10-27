import { ImageResponse } from "next/og";

import { getMessagesSafe } from "@/i18n/messages";
import { BRAND_NAME, BRAND_URL } from "@/lib/variables";

/**
 * Open Graph card, generated rather than committed.
 *
 * A static PNG would have to be redrawn by hand for every locale and would
 * drift the moment the wording changed. Generating it means the card always
 * says what the page says.
 */
export const alt = `${BRAND_NAME} — free invoice generator`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage(props: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await props.params;
    const messages = await getMessagesSafe(locale);
    const meta =
        (messages as Record<string, Record<string, string>>)?.meta ?? {};

    const title = meta.ogTitle ?? "Free invoice generator";
    const description =
        meta.ogDescription ??
        "Fifteen templates, client-side printing and bulk ZIP export. No account.";

    return new ImageResponse(
        (
            <div
                style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    background:
                        "linear-gradient(135deg, #020817 0%, #071426 55%, #020817 100%)",
                    padding: 72,
                    fontFamily: "system-ui, sans-serif",
                    position: "relative",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <div
                        style={{
                            width: 60,
                            height: 60,
                            borderRadius: 16,
                            background: "#2563EB",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#F8FAFC",
                            fontSize: 34,
                            fontWeight: 700,
                        }}
                    >
                        F
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontSize: 32,
                            fontWeight: 700,
                        }}
                    >
                        <span style={{ color: "#F8FAFC" }}>FatahTech</span>
                        <span style={{ color: "#22D3EE" }}>Invoice</span>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 22,
                    }}
                >
                    <div
                        style={{
                            color: "#F8FAFC",
                            fontSize: 68,
                            fontWeight: 700,
                            lineHeight: 1.08,
                            maxWidth: 940,
                        }}
                    >
                        {title}
                    </div>
                    <div
                        style={{
                            color: "#94A3B8",
                            fontSize: 30,
                            lineHeight: 1.35,
                            maxWidth: 860,
                        }}
                    >
                        {description}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderTop: "1px solid #1E293B",
                        paddingTop: 22,
                        color: "#64748B",
                        fontSize: 24,
                    }}
                >
                    <span>{BRAND_URL.replace(/^https?:\/\//, "")}</span>
                    <span style={{ color: "#22D3EE" }}>
                        Private · Client-side · Bulk export
                    </span>
                </div>
            </div>
        ),
        size
    );
}
