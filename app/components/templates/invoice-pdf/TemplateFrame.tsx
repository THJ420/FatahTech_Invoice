import React, { ReactNode } from "react";

// Labels & theme
import {
    DEFAULT_INVOICE_LABELS,
    type InvoiceTemplateExtras,
} from "./invoiceLabels";

// Variables
import { DEFAULT_LOCALE, dirForLocale } from "@/lib/variables";
import {
    densityScale,
    fontStack,
    resolveTheme,
    type InvoiceTheme,
} from "./invoiceTheme";

// Parts
import type { PartCtx } from "./parts";

// Types
import type { InvoiceType } from "@/types";

export type TemplateProps = InvoiceType & InvoiceTemplateExtras;

/**
 * Builds the context every layout part needs, from whatever props the template
 * was given. Missing labels fall back to English and a missing theme to the
 * default, so an invoice saved before theming existed still renders.
 */
export function templateCtx(data: TemplateProps): PartCtx {
    /*
     * The theme normally travels with the invoice (details.theme). The explicit
     * `theme` prop is an override, used by the gallery to preview a change
     * before it is committed to the form.
     */
    const theme: InvoiceTheme = resolveTheme(data.theme ?? data.details?.theme);
    return {
        data,
        labels: data.labels ?? DEFAULT_INVOICE_LABELS,
        theme,
        scale: densityScale(theme.density),
        // Defaults to English so a template rendered without one (a gallery
        // miniature, a test) still formats money rather than throwing.
        locale: data.locale ?? DEFAULT_LOCALE,
        dir: dirForLocale(data.locale ?? DEFAULT_LOCALE),
    };
}

/**
 * The sheet every layout sits on.
 *
 * Owns the things that must be identical across templates — the A4-ish page,
 * the chosen typeface, and the density padding — so a layout only concerns
 * itself with arrangement.
 *
 * The tall min-height is scoped to print media and to lg screens, so it fills
 * an A4 page without padding out a phone preview with 960px of empty white.
 *
 * 1123px is A4 at 96dpi. It used to be 60rem (960px), which is 163px short of
 * the page — a full-bleed rail or sidebar stopped ~1.7cm above the bottom of
 * the paper and left a white band under it.
 */
export default function TemplateFrame({
    ctx,
    children,
    bare = false,
}: {
    ctx: PartCtx;
    children: ReactNode;
    /** Skips the page padding, for layouts that paint edge-to-edge. */
    bare?: boolean;
}) {
    const { theme, scale, dir, data } = ctx;

    /*
     * Custom header and footer.
     *
     * Rendered here rather than in each layout so all fifteen templates get
     * them from one place. They are plain text bands with a hairline rule in
     * the invoice's accent colour, which is enough for a tagline, a legal
     * disclaimer or a registration number without turning the frame into a
     * second design system.
     *
     * `whitespace-pre-line` keeps intentional line breaks; the schema caps the
     * length so a pasted essay cannot push the invoice onto page three.
     */
    const headerText = data.details.headerText?.trim();
    const footerText = data.details.footerText?.trim();

    const band = bare ? "px-6 sm:px-12" : "";

    return (
        <section
            // The PDF is standalone HTML with no surrounding document to
            // inherit direction from, so the sheet declares its own.
            dir={dir}
            style={{ fontFamily: fontStack(theme.fontId), color: "#111827" }}
        >
            <div
                /*
                 * The rounded corners and clipping are for the on-screen
                 * preview only.
                 *
                 * In print they did real damage: rounding cut the corners off a
                 * full-bleed header now that the page has no margin, and
                 * `overflow-hidden` on the sheet is a pagination hazard —
                 * anything landing on page 2 can be clipped away entirely.
                 */
                className={`invoice-sheet flex min-h-[30rem] flex-col overflow-hidden rounded-xl bg-white lg:min-h-[60rem] print:min-h-[1123px] print:overflow-visible print:rounded-none ${
                    bare ? "" : scale.page
                }`}
            >
                {headerText && (
                    <div
                        data-edit-field="details.headerText"
                        className={`${band} shrink-0 pb-2`}
                        style={{
                            borderBottom: `1px solid ${theme.accentColor}`,
                        }}
                    >
                        <p className="whitespace-pre-line text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            {headerText}
                        </p>
                    </div>
                )}

                {/* `flex-1` lets the footer sit at the bottom of a short page
                    without the layout having to know it exists. */}
                <div className="flex min-h-0 flex-1 flex-col">{children}</div>

                {footerText && (
                    <div
                        data-edit-field="details.footerText"
                        className={`${band} mt-auto shrink-0 pt-2`}
                        style={{
                            borderTop: `1px solid ${theme.accentColor}`,
                        }}
                    >
                        <p className="whitespace-pre-line text-[10px] leading-relaxed text-gray-500">
                            {footerText}
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
