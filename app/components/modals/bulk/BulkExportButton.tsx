"use client";

import { useState } from "react";

// Next
import dynamic from "next/dynamic";

// Components
import BaseButton from "@/app/components/reusables/BaseButton";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { FileSpreadsheet } from "lucide-react";

/**
 * The wizard, SheetJS and the PDF renderer are all loaded on first click.
 * Keeping them out of the builder's initial bundle matters: the spreadsheet
 * parser alone is larger than the rest of the invoice UI.
 */
const BulkExportModal = dynamic(
    () => import("@/app/components/modals/bulk/BulkExportModal"),
    { ssr: false }
);

type BulkExportButtonProps = {
    variant?: "default" | "outline" | "ghost";
    className?: string;
    disabled?: boolean;
    tooltipLabel?: string;
};

const BulkExportButton = ({
    variant = "outline",
    className,
    disabled,
    tooltipLabel,
}: BulkExportButtonProps) => {
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);

    const { _t } = useTranslationContext();

    return (
        <>
            <BaseButton
                variant={variant}
                className={className}
                disabled={disabled}
                tooltipLabel={tooltipLabel}
                onClick={() => {
                    setMounted(true);
                    setOpen(true);
                }}
            >
                <FileSpreadsheet className="h-4 w-4" />
                {_t("bulkExport.trigger")}
            </BaseButton>

            {mounted && <BulkExportModal open={open} onOpenChange={setOpen} />}
        </>
    );
};

export default BulkExportButton;
