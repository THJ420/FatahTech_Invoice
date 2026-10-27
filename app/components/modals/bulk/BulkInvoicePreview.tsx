"use client";

import { useEffect, useRef, useState } from "react";

// Services
import {
    A4_HEIGHT_PX,
    A4_WIDTH_PX,
    buildInvoicePreviewHtml,
} from "@/services/invoice/client/bulkPdf";

// Utils
import { cn } from "@/lib/utils";

// Types
import type { InvoiceLabels } from "@/app/components/templates/invoice-pdf/invoiceLabels";
import type { InvoiceType } from "@/types";

type BulkInvoicePreviewProps = {
    invoice?: InvoiceType;
    labels: InvoiceLabels;
    locale: string;
    /**
     * `width` scales the page to the container and lets it scroll;
     * `contain` fits the whole A4 page inside a fixed-height frame.
     */
    fit?: "width" | "contain";
    className?: string;
};

/**
 * A real A4 render of the first bulk record.
 *
 * This is an <iframe> rather than the template component directly for two
 * reasons: the markup gets its own 794px viewport (so the A4 `sm:` layout
 * applies on a phone too), and the app's global styles cannot leak into the
 * preview or vice versa. It is the same document the PDF exporter captures.
 */
const BulkInvoicePreview = ({
    invoice,
    labels,
    locale,
    fit = "width",
    className,
}: BulkInvoicePreviewProps) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [box, setBox] = useState({ width: 0, height: 0 });
    const [html, setHtml] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const node = wrapperRef.current;
        if (!node) return;

        const update = () =>
            setBox({
                width: node.clientWidth,
                height: node.clientHeight,
            });

        update();

        const observer = new ResizeObserver(update);
        observer.observe(node);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!invoice) {
            setHtml(null);
            setError(null);
            return;
        }

        let cancelled = false;
        setHtml(null);
        setError(null);

        buildInvoicePreviewHtml({ data: invoice, labels, locale })
            .then((documentHtml) => {
                if (!cancelled) setHtml(documentHtml);
            })
            .catch((reason: unknown) => {
                if (cancelled) return;
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Could not render the preview."
                );
            });

        return () => {
            cancelled = true;
        };
    }, [invoice, labels, locale]);

    const widthScale = box.width > 0 ? box.width / A4_WIDTH_PX : 0.5;
    const heightScale =
        fit === "contain" && box.height > 0
            ? box.height / A4_HEIGHT_PX
            : widthScale;
    const scale = Math.max(0.1, Math.min(1, widthScale, heightScale));

    const frameWidth = A4_WIDTH_PX * scale;
    const frameHeight = A4_HEIGHT_PX * scale;

    return (
        <div
            ref={wrapperRef}
            className={cn(
                "relative w-full overflow-hidden rounded-lg border border-border",
                fit === "contain"
                    ? "flex items-center justify-center bg-muted/40"
                    : "mx-auto bg-white",
                className
            )}
            style={fit === "width" ? { height: frameHeight } : undefined}
        >
            {html ? (
                <div
                    className={cn(
                        "relative overflow-hidden bg-white shadow-xl",
                        fit === "contain" && "rounded-sm"
                    )}
                    style={{ width: frameWidth, height: frameHeight }}
                >
                    <iframe
                        title="Bulk invoice preview"
                        srcDoc={html}
                        scrolling="no"
                        tabIndex={-1}
                        className="origin-top-left border-0 bg-white"
                        style={{
                            width: A4_WIDTH_PX,
                            height: A4_HEIGHT_PX,
                            transform: `scale(${scale})`,
                        }}
                    />
                </div>
            ) : (
                <div
                    className={cn(
                        "flex items-center justify-center p-6 text-center text-sm",
                        fit === "contain"
                            ? "h-full w-full text-muted-foreground"
                            : "h-full text-muted-foreground"
                    )}
                >
                    {error ?? "Rendering the first invoice…"}
                </div>
            )}
        </div>
    );
};

export default BulkInvoicePreview;
