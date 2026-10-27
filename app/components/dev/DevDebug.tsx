"use client";

// RHF
import { useFormContext } from "react-hook-form";

/**
 * Development-only scratch panel, mounted in the navbar's middle slot.
 *
 * It used to link to `/template/1` and `/template/2`. Those routes rendered
 * `InvoiceTemplate{id}`, files deleted in round 2 when the thirteen composable
 * layouts replaced them — so both links threw. They are gone, and so is the
 * route they pointed at.
 *
 * The "Fill in the form" button that lived here is gone too: the form now has
 * one of its own, in the quick actions above the first field, and it fills a
 * complete, valid invoice rather than the partial fixture this panel used. Two
 * buttons with the same label in the same session was the confusing half of
 * that; the other half was a dev fill that could not be printed, because its
 * fixture predated the required payment terms.
 */
const DevDebug = () => {
    const { formState } = useFormContext();

    return (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-destructive/60 px-3 py-1.5 text-xs">
            <span className="font-semibold uppercase tracking-wider text-destructive">
                Dev
            </span>

            <span className="whitespace-nowrap text-muted-foreground">
                Form:{" "}
                <span className="font-medium text-foreground">
                    {formState.isDirty ? "Dirty" : "Clean"}
                </span>
            </span>
        </div>
    );
};

export default DevDebug;
