"use client";

// Debounce
import { useDebounce } from "use-debounce";

// RHF
import { useFormContext, useWatch } from "react-hook-form";

// Components
import LivePreview from "./LivePreview";

// Types
import { InvoiceType } from "@/types";

/**
 * Owns the full-form subscription.
 *
 * Split out of InvoicePreview so the watch only exists while the live preview
 * is on screen. Subscribing in the parent would re-render the whole preview
 * column on every keystroke, including the fit-to-pane measurements.
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

type InvoicePreviewProps = {
    /** Scale the live preview so the whole page fits the pane. */
    fit?: boolean;
};

/**
 * The invoice preview column.
 *
 * The preview is always the live template rendered from form values — there is
 * no generated-PDF mode to switch into, because printing renders the same
 * template fresh in the browser.
 */
const InvoicePreview = ({ fit = true }: InvoicePreviewProps) => {
    return (
        // No vertical margin in the shell: the pane owns its own padding, and
        // a margin here would be counted against the height the fit measures.
        <div className="my-3 shell:my-0 shell:h-full">
            <LivePreviewWatcher fit={fit} />
        </div>
    );
};

export default InvoicePreview;
