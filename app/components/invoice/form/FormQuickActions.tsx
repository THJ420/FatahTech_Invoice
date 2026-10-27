"use client";

// Components
import BaseButton from "@/app/components/reusables/BaseButton";

// Contexts
import { useInvoiceContext } from "@/contexts/InvoiceContext";
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { Eraser, Wand2 } from "lucide-react";

/**
 * The two shortcuts at the top of the form.
 *
 * Both replace everything the user has typed, which is why they sit above the
 * first field rather than inside a menu: an action that overwrites the whole
 * document should be somewhere it cannot be hit by accident while reaching for
 * something else.
 *
 * "Fill in the form" is the answer to the empty-state problem — a blank invoice
 * generator gives you nothing to look at, and the interesting part of this
 * product is the finished document, not the form. It fills every field with a
 * complete example so the preview, the template gallery and the print dialog
 * all have something real to show.
 */
const FormQuickActions = () => {
    const { fillWithSampleData, clearForm, printLoading } = useInvoiceContext();
    const { _t } = useTranslationContext();

    return (
        <div className="flex flex-wrap items-center gap-2">
            <BaseButton
                type="button"
                variant="outline"
                size="sm"
                disabled={printLoading}
                tooltipLabel={_t("form.quickActions.fillTooltip")}
                onClick={fillWithSampleData}
            >
                <Wand2 className="h-4 w-4" />
                {_t("form.quickActions.fill")}
            </BaseButton>

            <BaseButton
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                disabled={printLoading}
                tooltipLabel={_t("form.quickActions.clearTooltip")}
                onClick={clearForm}
            >
                <Eraser className="h-4 w-4" />
                {_t("form.quickActions.clear")}
            </BaseButton>
        </div>
    );
};

export default FormQuickActions;
