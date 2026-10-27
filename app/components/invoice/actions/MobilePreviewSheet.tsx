"use client";

import { ReactNode, useState } from "react";

// ShadCn
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

// Components
import { BaseButton, PdfViewer } from "@/app/components";

// Contexts
import { useInvoiceContext } from "@/contexts/InvoiceContext";
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { Printer } from "lucide-react";

type MobilePreviewSheetProps = {
    children: ReactNode;
};

/**
 * Full-height bottom sheet holding the live preview.
 *
 * Used below xl, where there is no room for the preview column. The viewer is
 * only mounted while the sheet is open so the invoice template is not being
 * re-rendered off-screen on every keystroke.
 */
const MobilePreviewSheet = ({ children }: MobilePreviewSheetProps) => {
    const [open, setOpen] = useState(false);

    const { _t } = useTranslationContext();
    const { printLoading, printInvoice } = useInvoiceContext();

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>{children}</SheetTrigger>
            <SheetContent
                side="bottom"
                className="flex h-[92dvh] flex-col rounded-t-xl p-0"
            >
                <SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b px-4 py-3 text-start">
                    <SheetTitle>{_t("actions.previewTitle")}</SheetTitle>
                    <BaseButton
                        variant="outline"
                        size="sm"
                        loading={printLoading}
                        loadingText={_t("actions.printInvoiceLoading")}
                        onClick={() => void printInvoice()}
                    >
                        <Printer className="h-4 w-4" />
                        {_t("actions.printInvoice")}
                    </BaseButton>
                </SheetHeader>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
                    {open && <PdfViewer />}
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default MobilePreviewSheet;
