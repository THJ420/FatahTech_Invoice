"use client";

// Components
import { BaseButton, MobilePreviewSheet } from "@/app/components";

// Contexts
import { useInvoiceContext } from "@/contexts/InvoiceContext";
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { Eye, Printer } from "lucide-react";

/**
 * Sticky bottom bar shown below xl, holding the two actions that matter on a
 * phone: open the preview, and print the invoice.
 *
 * `type="button"` on Print rather than submit: printing does not need the form
 * to validate first — the print service checks the values itself and reports a
 * problem with a toast — and routing it through submit would run the schema
 * twice.
 */
const MobileActionBar = () => {
    const { printLoading, printInvoice } = useInvoiceContext();

    const { _t } = useTranslationContext();

    return (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 xl:hidden">
            <div className="pb-safe flex items-center gap-3 px-4 py-3">
                <MobilePreviewSheet>
                    <BaseButton
                        variant="outline"
                        // whitespace-nowrap: at 375px the two buttons split the
                        // row and the labels wrapped inside a fixed-height
                        // button, so the second line was clipped.
                        className="flex-1 whitespace-nowrap"
                        size="lg"
                        disabled={printLoading}
                    >
                        <Eye className="h-5 w-5" />
                        {_t("actions.preview")}
                    </BaseButton>
                </MobilePreviewSheet>

                <BaseButton
                    type="button"
                    className="flex-1 whitespace-nowrap"
                    size="lg"
                    loading={printLoading}
                    loadingText={_t("actions.printInvoiceLoading")}
                    onClick={() => void printInvoice()}
                >
                    <Printer className="h-5 w-5" />
                    {_t("actions.printInvoice")}
                </BaseButton>
            </div>
        </div>
    );
};

export default MobileActionBar;
