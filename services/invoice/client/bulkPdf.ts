import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// Templates
import {
    DEFAULT_TEMPLATE_ID,
    getTemplateEntry,
} from "@/app/components/templates/invoice-pdf/registry";
import type { InvoiceLabels } from "@/app/components/templates/invoice-pdf/invoiceLabels";

// Print styles
import { collectStyles } from "./printInvoice";

// Variables
import { dirForLocale } from "@/lib/variables";

// Types
import type { InvoiceType } from "@/types";

/** A4 at 96dpi, the width the templates are designed against. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CAPTURE_SCALE = 2;

type InvoicePdfOptions = {
    data: InvoiceType;
    labels: InvoiceLabels;
    locale: string;
};

type InvoiceHtml = {
    bodyHtml: string;
    styles: string;
    bodyClass: string;
};

const escapeAttribute = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

/**
 * Serialises the selected template to HTML.
 *
 * Rendering into a hidden host and taking its markup — rather than mounting
 * React inside the iframe — keeps this identical to what the print service
 * does. The iframe is what gives the markup a 794px viewport, so the `sm:`
 * layout that an A4 page expects applies even when the user is on a phone.
 */
async function renderInvoiceHtml({
    data,
    labels,
    locale,
}: InvoicePdfOptions): Promise<InvoiceHtml> {
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
        "width:794px",
        "pointer-events:none",
        "opacity:0",
        "background:#fff",
    ].join(";");

    document.body.appendChild(host);
    const root = createRoot(host);

    try {
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
            styles: collectStyles(),
            bodyClass: document.body.className,
        };
    } finally {
        try {
            root.unmount();
        } catch {
            // The root may not have committed.
        }
        host.remove();
    }
}

/**
 * Wraps the template markup in a standalone A4 document.
 *
 * The body class is carried over because the signature fonts are exposed as
 * CSS variables on it. The `invoice-sheet` rules undo the on-screen card
 * treatment: a PDF page must not have rounded, clipped corners, and a short
 * invoice should still fill one full A4 sheet.
 */
export function buildBulkDocument({
    bodyHtml,
    styles,
    bodyClass,
}: InvoiceHtml): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<base href="${escapeAttribute(document.baseURI)}">
${styles}
<style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body.bulk-capture {
        width: ${A4_WIDTH_PX}px;
        min-height: ${A4_HEIGHT_PX}px;
        background: #fff !important;
        color: #111827;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    body.bulk-capture .invoice-sheet {
        min-height: ${A4_HEIGHT_PX}px !important;
        border-radius: 0 !important;
        overflow: visible !important;
    }
</style>
</head>
<body class="${escapeAttribute(bodyClass)} bulk-capture">${bodyHtml}</body>
</html>`;
}

function createIframe(html: string): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `width:${A4_WIDTH_PX}px`,
        `height:${A4_HEIGHT_PX}px`,
        "border:0",
        "opacity:0",
        "pointer-events:none",
    ].join(";");

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
        iframe.remove();
        throw new Error("Could not create the invoice render frame.");
    }

    doc.open();
    doc.write(html);
    doc.close();

    return iframe;
}

function waitForIframe(iframe: HTMLIFrameElement): Promise<void> {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;

    if (!win || !doc) return Promise.resolve();

    return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        // A missing font or image must not hold the batch hostage.
        window.setTimeout(finish, 10_000);

        const afterLoad = async () => {
            try {
                await doc.fonts?.ready;
            } catch {
                // Older webviews lack the FontFaceSet API.
            }

            const images = Array.from(doc.images);
            await Promise.all(
                images.map(
                    (image) =>
                        new Promise<void>((done) => {
                            if (image.complete) {
                                done();
                                return;
                            }
                            image.addEventListener("load", () => done(), {
                                once: true,
                            });
                            image.addEventListener("error", () => done(), {
                                once: true,
                            });
                        })
                )
            );

            win.requestAnimationFrame(() => {
                win.requestAnimationFrame(finish);
            });
        };

        if (doc.readyState === "complete") {
            void afterLoad();
        } else {
            win.addEventListener("load", () => void afterLoad(), {
                once: true,
            });
        }
    });
}

async function captureIframe(
    iframe: HTMLIFrameElement
): Promise<HTMLCanvasElement> {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("The invoice render frame disappeared.");

    await waitForIframe(iframe);

    const { domToCanvas } = await import("modern-screenshot");
    const contentHeight = Math.max(
        A4_HEIGHT_PX,
        Math.ceil(doc.body.scrollHeight)
    );

    return domToCanvas(doc.body, {
        width: A4_WIDTH_PX,
        height: contentHeight,
        scale: CAPTURE_SCALE,
        backgroundColor: "#ffffff",
        font: { preferredFormat: "woff2" },
        timeout: 30_000,
        maximumCanvasSize: 16_000,
    });
}

function canvasToPdf(
    canvas: HTMLCanvasElement,
    JsPDF: typeof import("jspdf").jsPDF
): Uint8Array {
    const pdf = new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
    });

    const pxPerMm = canvas.width / A4_WIDTH_MM;
    const pageHeightPx = Math.round(A4_HEIGHT_MM * pxPerMm);
    const pageCount = Math.max(
        1,
        Math.ceil((canvas.height - 1) / pageHeightPx)
    );

    for (let page = 0; page < pageCount; page += 1) {
        if (page > 0) pdf.addPage();

        const sourceY = page * pageHeightPx;
        const sliceHeight = Math.min(pageHeightPx, canvas.height - sourceY);

        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = pageHeightPx;

        const context = slice.getContext("2d");
        if (!context) throw new Error("Could not prepare the PDF page.");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sliceHeight,
            0,
            0,
            canvas.width,
            sliceHeight
        );

        pdf.addImage(
            slice.toDataURL("image/jpeg", 0.92),
            "JPEG",
            0,
            0,
            A4_WIDTH_MM,
            sliceHeight / pxPerMm,
            undefined,
            "FAST"
        );
    }

    return new Uint8Array(pdf.output("arraybuffer"));
}

export type RenderedInvoicePdf = {
    bytes: Uint8Array;
    fileName: string;
};

/** Turns an invoice number into a safe member name inside the ZIP. */
export function invoiceFileName(invoiceNumber: string, index: number): string {
    const safe = invoiceNumber
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    return `${safe || `invoice-${index + 1}`}.pdf`;
}

/**
 * Renders one invoice to a PDF, entirely in the browser.
 *
 * The template is serialised to HTML, laid out in an off-screen 794px iframe,
 * rasterised at 2× and sliced onto A4 pages. No API route is involved.
 */
export async function renderInvoicePdf({
    data,
    labels,
    locale,
    index,
}: InvoicePdfOptions & { index: number }): Promise<RenderedInvoicePdf> {
    const html = await renderInvoiceHtml({ data, labels, locale });
    const iframe = createIframe(buildBulkDocument(html));

    try {
        const [canvas, { jsPDF }] = await Promise.all([
            captureIframe(iframe),
            import("jspdf"),
        ]);

        return {
            bytes: canvasToPdf(canvas, jsPDF),
            fileName: invoiceFileName(data.details.invoiceNumber, index),
        };
    } finally {
        iframe.remove();
    }
}

/** The same document, for the wizard's live <iframe> preview. */
export async function buildInvoicePreviewHtml(
    options: InvoicePdfOptions
): Promise<string> {
    return buildBulkDocument(await renderInvoiceHtml(options));
}
