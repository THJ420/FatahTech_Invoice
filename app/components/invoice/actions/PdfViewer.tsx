"use client";

// Debounce
import { useDebounce } from "use-debounce";

// RHF
import { useFormContext, useWatch } from "react-hook-form";

// Components
import { LivePreview } from "@/app/components";

// Types
import { InvoiceType } from "@/types";

/**
 * Owns the full-form subscription.
 *
 * Split into its own component so the watch only exists while the preview is
 * on screen, and so the debounce sits between the form and the template.
 */
const LivePreviewWatcher = ({ fit }: { fit: boolean }) => {
    const { control } = useFormContext<InvoiceType>();

    /*
     * `useDebounce` debounces a value, but `watch` is a stable function
     * reference that never changes — so the previous
     * `useDebounce(watch, 1000)` was inert, and calling `watch()` bare during
     * render subscribed to every field. The result was a full re-render of the
     * invoice template on every keystroke.
     *
     * Debouncing the values instead means `debouncedValues` keeps a stable
     * identity between ticks, so the memoised LivePreview below can bail out.
     */
    const formValues = useWatch({ control }) as InvoiceType;
    const [debouncedValues] = useDebounce(formValues, 400);

    return <LivePreview data={debouncedValues} fit={fit} />;
};

type PdfViewerProps = {
    /** Scale the live preview so the whole page fits the pane. */
    fit?: boolean;
};

/**
 * Everything the app shows of the document itself.
 *
 * There is no generated-PDF state any more: printing renders the same live
 * template into a clean print view, so the preview never has to hand over to a
 * separate final document.
 */
const PdfViewer = ({ fit = true }: PdfViewerProps) => {
    return (
        // No vertical margin in the shell: the pane owns its own padding, and
        // a margin here would be counted against the height the fit measures.
        <div className="my-3 shell:my-0 shell:h-full">
            <LivePreviewWatcher fit={fit} />
        </div>
    );
};

export default PdfViewer;
