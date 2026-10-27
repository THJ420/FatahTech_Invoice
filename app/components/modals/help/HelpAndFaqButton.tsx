"use client";

import { useState } from "react";

// Next
import dynamic from "next/dynamic";

// Components
import BaseButton from "@/app/components/reusables/BaseButton";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { HelpCircle } from "lucide-react";

/**
 * The modal is fetched on first click. It is a screenful of prose that most
 * sessions never open, and it has no business in the builder's initial bundle —
 * the same reasoning BulkExportButton applies to the spreadsheet wizard.
 */
const HelpAndFaqModal = dynamic(
    () => import("@/app/components/modals/help/HelpAndFaqModal"),
    { ssr: false }
);

/**
 * Navbar trigger for the help panel.
 *
 * Sits beside the theme toggle so the two things a user reaches for when
 * something is unclear — "make it lighter" and "what does this do" — are in
 * the same place on every page.
 */
const HelpAndFaqButton = () => {
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);

    const { _t } = useTranslationContext();

    return (
        <>
            <BaseButton
                variant="ghost"
                size="icon"
                aria-label={_t("help.trigger")}
                tooltipLabel={_t("help.triggerTooltip")}
                onClick={() => {
                    setMounted(true);
                    setOpen(true);
                }}
            >
                <HelpCircle className="h-5 w-5" />
            </BaseButton>

            {mounted && (
                <HelpAndFaqModal open={open} onOpenChange={setOpen} />
            )}
        </>
    );
};

export default HelpAndFaqButton;
