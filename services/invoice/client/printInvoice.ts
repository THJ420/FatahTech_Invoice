import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// Invoice templates
import {
    DEFAULT_TEMPLATE_ID,
    getTemplateEntry,
} from "@/app/components/templates/invoice-pdf/registry";
import type { InvoiceLabels } from "@/app/components/templates/invoice-pdf/invoiceLabels";

// Variables
import { dirForLocale } from "@/lib/variables";

// Types
import type { InvoiceType } from "@/types";

export type PrintInvoiceOptions = {
    data: InvoiceType;
    labels: InvoiceLabels;
    locale: string;
};

type InvoiceHtml = {
    /** The template's markup, rendered from the current form values. */
    bodyHtml: string;
    /** Carries the signature-font CSS variables defined on the app's <body>. */
    bodyClass: string;
};

/** A4 at 96dpi — the width the templates are designed against. */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

/*
 * Both of these are ceilings, not delays. The frame is off-screen and its
 * stylesheets are inlined, so the usual wait is the time it takes to decode a
 * data-URL logo — a few milliseconds. They exist only so a stalled remote asset
 * cannot keep the print dialog from opening at all.
 */
const PRINT_LOAD_MS = 700;
const PRINT_FONT_MS = 200;

/** How long the frame outlives the dialog, for browsers that never fire `afterprint`. */
const PRINT_FRAME_LIFETIME_MS = 60_000;

const PRINT_FALLBACK_ID = "invoice-print-fallback";
const PRINT_FALLBACK_STYLE_ID = "invoice-print-fallback-styles";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Runs `promise`, but never longer than `ms`. */
function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
    return Promise.race([
        promise.then(() => undefined).catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
    ]);
}

/* =========================
 * Styles
 * ========================= */

let stylesCache: { key: string; css: string } | null = null;

/**
 * The app's own stylesheets, serialised for the print document.
 *
 * The print view needs exactly what the live preview has: the compiled Tailwind
 * rules, every `@font-face` the templates use, and the theme variables. All of
 * it is already parsed in this document, so it is copied rather than fetched —
 * no server round trip, and no second parse of a remote file inside the frame.
 *
 * `<style>` elements contribute their `textContent` verbatim: their URLs were
 * already resolved against the app's base URL, which the print document repeats
 * with `<base>`. `<link>` elements are inlined from their `cssRules` for the
 * same reason — a copied `<link>` would make the frame fetch and re-parse the
 * stylesheet before it could lay out, which is a large part of why printing
 * used to feel slow. A cross-origin sheet (a font CDN, say) refuses that
 * access, so it falls back to the tag itself.
 *
 * Memoised because Bulk Export calls this once per invoice: a 500-invoice batch
 * was re-serialising every stylesheet 500 times.
 */
export function collectStyles(): string {
    const nodes = Array.from(
        document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
            'style, link[rel="stylesheet"]'
        )
    );

    // Cheap fingerprint: enough to notice an HMR update or a lazily added sheet.
    const key = nodes
        .map((node) =>
            node.tagName === "STYLE"
                ? `s${node.textContent?.length ?? 0}`
                : `l${node.getAttribute("href") ?? ""}`
        )
        .join("|");

    if (stylesCache?.key === key) return stylesCache.css;

    const chunks: string[] = [];

    for (const node of nodes) {
        if (node.tagName === "STYLE") {
            const css = node.textContent;
            if (css) chunks.push(`<style>${css}</style>`);
            continue;
        }

        const sheet = (node as HTMLLinkElement).sheet;

        try {
            const rules = sheet?.cssRules;
            if (!rules || rules.length === 0) {
                chunks.push(node.outerHTML);
                continue;
            }

            let css = "";
            for (const rule of Array.from(rules)) css += rule.cssText;
            chunks.push(`<style>${css}</style>`);
        } catch {
            // Cross-origin stylesheet — the browser will not hand over its rules.
            chunks.push(node.outerHTML);
        }
    }

    const css = chunks.join("\n");
    stylesCache = { key, css };

    return css;
}

/* =========================
 * Rendering
 * ========================= */

/**
 * Renders the selected template to markup with the current form values.
 *
 * The host only exists to give React somewhere to commit to — nothing about it
 * is measured, painted or waited on. In particular there is deliberately no
 * `document.fonts.ready` or image wait here: the frame below loads its own
 * assets, and waiting in this document for fonts the *app* is using was what
 * made a print take seconds rather than milliseconds.
 */
async function renderInvoiceHtml({
    data,
    labels,
    locale,
}: PrintInvoiceOptions): Promise<InvoiceHtml> {
    const templateId = data.details.pdfTemplate ?? DEFAULT_TEMPLATE_ID;
    const entry =
        getTemplateEntry(templateId) ?? getTemplateEntry(DEFAULT_TEMPLATE_ID)!;
    const { default: InvoiceTemplate } = await entry.load();

    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `width:${A4_WIDTH_PX}px`,
        "pointer-events:none",
        "opacity:0",
        "background:#fff",
    ].join(";");

    document.body.appendChild(host);
    const root = createRoot(host);

    try {
        // `flushSync` commits the tree before the markup is read on the next
        // line. Without it the read would race React's scheduler.
        flushSync(() => {
            root.render(
                createElement(InvoiceTemplate, {
                    ...data,
                    labels,
                    locale,
                })
            );
        });

        return {
            bodyHtml: host.innerHTML,
            bodyClass: document.body.className,
        };
    } finally {
        try {
            root.unmount();
        } catch {
            // The root may not have committed; removing the host is enough.
        }
        host.remove();
    }
}

/**
 * Wraps the template markup in a standalone A4 document.
 *
 * There is no toolbar and no placeholder screen: the document is only ever
 * written into an off-screen frame, so anything visible would never be seen.
 */
function buildPrintDocument({
    bodyHtml,
    bodyClass,
    styles,
    title,
    locale,
    dir,
}: InvoiceHtml & {
    styles: string;
    title: string;
    locale: string;
    dir: "ltr" | "rtl";
}): string {
    return `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${dir}">
<head>
<meta charset="utf-8">
<base href="${escapeHtml(document.baseURI)}">
<title>${escapeHtml(title)}</title>
${styles}
<style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .invoice-print-page { width: 210mm; max-width: 100%; background: #fff; }
    /* The card treatment is for the on-screen preview only. */
    .invoice-print-page > section > div { border-radius: 0 !important; }
    @page { size: A4; margin: 0; }
    @media print {
        html, body { background: #fff !important; }
        .invoice-print-page { width: auto; max-width: none; margin: 0; }
    }
</style>
</head>
<body class="${escapeHtml(bodyClass)}">
<main class="invoice-print-page">${bodyHtml}</main>
</body>
</html>`;
}

/* =========================
 * Frame plumbing
 * ========================= */

/**
 * An off-screen A4 frame holding the print document.
 *
 * A frame rather than a popup: `window.open` can be blocked, costs a second
 * document and a placeholder paint, and needs a user gesture that an async
 * template import may already have spent. A same-document frame has none of
 * those problems and prints only its own content.
 *
 * It is sized to A4 and parked off-screen rather than hidden with
 * `display:none`, `visibility:hidden` or a zero viewport. The templates lay
 * themselves out against the frame's width, so a `0px` viewport would collapse
 * the page; and a frame that is not rendered at all cannot be printed.
 */
function createFrame(html: string): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.title = "Invoice print view";
    frame.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `width:${A4_WIDTH_PX}px`,
        `height:${A4_HEIGHT_PX}px`,
        "border:0",
        "pointer-events:none",
    ].join(";");

    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
        frame.remove();
        throw new Error("Could not create the invoice print frame.");
    }

    doc.open();
    doc.write(html);
    doc.close();

    return frame;
}

/**
 * Resolves when the frame has finished loading, or after `PRINT_LOAD_MS`.
 *
 * `load` covers the images; the stylesheets are inlined, so there is normally
 * nothing else outstanding by the time it fires.
 */
function waitForFrame(frame: HTMLIFrameElement): Promise<void> {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;

    if (!win || !doc || doc.readyState === "complete") return Promise.resolve();

    return new Promise<void>((resolve) => {
        let settled = false;
        let timer = 0;

        const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            win.removeEventListener("load", finish);
            resolve();
        };

        timer = window.setTimeout(finish, PRINT_LOAD_MS);
        win.addEventListener("load", finish, { once: true });
    });
}

/** Fonts are already cached from the live preview; never wait long for them. */
function waitForFonts(doc: Document | null): Promise<void> {
    const fonts = doc?.fonts;
    if (!fonts?.ready) return Promise.resolve();

    return withTimeout(fonts.ready, PRINT_FONT_MS);
}

/**
 * Removes the frame once the browser is done with it.
 *
 * Not when `printInvoice` resolves: the dialog reads the frame's document, so
 * tearing it down early cancels the job. `afterprint` is the signal that it is
 * safe; the timer is the fallback for webviews that never send it.
 */
function releaseFrameWhenDone(frame: HTMLIFrameElement): void {
    const win = frame.contentWindow;

    let released = false;
    let timer = 0;

    const release = () => {
        if (released) return;
        released = true;
        window.clearTimeout(timer);
        frame.remove();
    };

    win?.addEventListener("afterprint", release, { once: true });
    timer = window.setTimeout(release, PRINT_FRAME_LIFETIME_MS);
}

/* =========================
 * Fallback
 * ========================= */

const FALLBACK_PRINT_CSS = `
    @page { size: A4; margin: 0; }
    @media print {
        html.invoice-printing body > *:not(#${PRINT_FALLBACK_ID}) {
            display: none !important;
        }
        html.invoice-printing #${PRINT_FALLBACK_ID} {
            position: static !important;
            inset: auto !important;
            display: block !important;
            background: #fff !important;
            overflow: visible !important;
        }
        html.invoice-printing #${PRINT_FALLBACK_ID} [data-print-toolbar] {
            display: none !important;
        }
        html.invoice-printing #${PRINT_FALLBACK_ID} [data-print-scroller] {
            overflow: visible !important;
            padding: 0 !important;
        }
        html.invoice-printing #${PRINT_FALLBACK_ID} [data-print-paper] {
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
        }
    }
`;

/**
 * In-app print view, for the webviews that refuse to print a frame.
 *
 * The markup goes straight into the app document, where the stylesheets and the
 * font variables on `<body>` already apply — so this needs no styling of its
 * own beyond hiding everything else at print time.
 */
function showFallback(bodyHtml: string, title: string): void {
    // A second click while the overlay is open should not stack two of them.
    document.getElementById(PRINT_FALLBACK_ID)?.remove();
    document.getElementById(PRINT_FALLBACK_STYLE_ID)?.remove();

    const style = document.createElement("style");
    style.id = PRINT_FALLBACK_STYLE_ID;
    style.textContent = FALLBACK_PRINT_CSS;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = PRINT_FALLBACK_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", title);
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#e5e7eb;";

    overlay.innerHTML = `
        <div data-print-toolbar style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 16px;background:#111827;color:#fff;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
            <span style="margin-right:auto;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(
                title
            )}</span>
            <button type="button" data-print-action style="border:0;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;background:#fff;color:#111827">Print / Save as PDF</button>
            <button type="button" data-print-close style="border:0;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;background:transparent;color:#e5e7eb;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)">Close</button>
            <p style="flex-basis:100%;margin:0;font-size:12px;color:#d1d5db">If the dialog does not open, use your browser's menu → Print.</p>
        </div>
        <div data-print-scroller style="flex:1;overflow:auto;padding:24px 16px 48px">
            <div data-print-paper style="width:210mm;max-width:100%;margin:0 auto;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.14)">${bodyHtml}</div>
        </div>`;

    document.body.appendChild(overlay);

    const printButton = overlay.querySelector<HTMLButtonElement>(
        "[data-print-action]"
    );
    const closeButton = overlay.querySelector<HTMLButtonElement>(
        "[data-print-close]"
    );

    let cleanupTimer: number | null = null;

    const cleanupPrintClass = () => {
        document.documentElement.classList.remove("invoice-printing");
        window.removeEventListener("afterprint", cleanupPrintClass);

        if (cleanupTimer !== null) {
            window.clearTimeout(cleanupTimer);
            cleanupTimer = null;
        }
    };

    const print = () => {
        document.documentElement.classList.add("invoice-printing");
        window.addEventListener("afterprint", cleanupPrintClass, {
            once: true,
        });

        if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
        cleanupTimer = window.setTimeout(cleanupPrintClass, 60_000);

        try {
            window.print();
        } catch {
            cleanupPrintClass();
        }
    };

    const close = () => {
        cleanupPrintClass();
        overlay.remove();
        style.remove();
        document.removeEventListener("keydown", onKeyDown);
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") close();
    };

    printButton?.addEventListener("click", print);
    closeButton?.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);

    printButton?.focus();
}

/* =========================
 * Entry point
 * ========================= */

/**
 * Print the invoice using the browser's native print engine.
 *
 * The template is rendered fresh from the current form values, so the output is
 * never a stale preview, and it is written into an off-screen A4 frame whose
 * stylesheets are inlined. The dialog opens as soon as that frame has its
 * images — typically well under a second — and the promise resolves at that
 * point, so the "Preparing…" state on the button clears with it.
 */
export async function printInvoice(
    options: PrintInvoiceOptions
): Promise<void> {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return;
    }

    const title = options.data.details.invoiceNumber
        ? `Invoice ${options.data.details.invoiceNumber}`
        : "Invoice";

    /*
     * Render before touching the DOM of a frame: if the template chunk cannot
     * be loaded there is nothing to print, and the caller turns the rejection
     * into an error toast.
     */
    const markup = await renderInvoiceHtml(options);

    const html = buildPrintDocument({
        ...markup,
        styles: collectStyles(),
        title,
        locale: options.locale,
        dir: dirForLocale(options.locale),
    });

    let frame: HTMLIFrameElement | null = null;

    try {
        frame = createFrame(html);

        await waitForFrame(frame);
        await waitForFonts(frame.contentDocument);

        const win = frame.contentWindow;
        if (!win) throw new Error("The invoice print frame disappeared.");

        win.focus();
        win.print();

        // The dialog owns the frame from here.
        releaseFrameWhenDone(frame);
        frame = null;
    } catch (error) {
        if (frame) frame.remove();

        // Some embedded webviews refuse to print a frame. They can still print
        // the main document, so the invoice moves into it instead.
        console.error("Printing from a frame failed; using the in-app view.", error);
        showFallback(markup.bodyHtml, title);
    }
}
