"use client";

import { useState } from "react";

// ShadCn
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// Components
import { BaseButton } from "@/app/components";

// Context
import { useInvoiceContext } from "@/contexts/InvoiceContext";
import { useTranslationContext } from "@/contexts/TranslationContext";

// Types
import { ExportTypes } from "@/types";

type InvoiceExportModalType = {
    children: React.ReactNode;
};

const InvoiceExportModal = ({ children }: InvoiceExportModalType) => {
    const [open, setOpen] = useState(false);

    const { exportInvoiceAs } = useInvoiceContext();
    const { _t } = useTranslationContext();

    const exportButton = (
        format: ExportTypes,
        label: string,
        tooltip: string
    ) => (
        <BaseButton
            key={format}
            tooltipLabel={tooltip}
            variant="outline"
            className="w-full"
            onClick={() => exportInvoiceAs(format)}
        >
            {label}
        </BaseButton>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{_t("actions.exportTitle")}</DialogTitle>
                    <DialogDescription>
                        {_t("actions.exportDescription")}
                    </DialogDescription>
                </DialogHeader>

                {/*
                 * XLSX is deliberately absent: the server-side case for it has
                 * been commented out, so the button only ever produced an
                 * error. See the note in exportInvoiceService.
                 */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {exportButton(
                        ExportTypes.JSON,
                        "JSON",
                        _t("actions.exportJsonTooltip")
                    )}
                    {exportButton(
                        ExportTypes.CSV,
                        "CSV",
                        _t("actions.exportCsvTooltip")
                    )}
                    {exportButton(
                        ExportTypes.XML,
                        "XML",
                        _t("actions.exportXmlTooltip")
                    )}
                </div>

                <Separator className="my-1" />

                <div className="space-y-3">
                    <div>
                        <p className="text-sm font-medium">
                            {_t("actions.exportEInvoiceHeading")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {_t("actions.exportXrechnungHint")}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {exportButton(
                            ExportTypes.XRECHNUNG_UBL,
                            _t("actions.exportXrechnungUbl"),
                            _t("actions.exportXrechnungHint")
                        )}
                        {exportButton(
                            ExportTypes.XRECHNUNG_CII,
                            _t("actions.exportXrechnungCii"),
                            _t("actions.exportXrechnungHint")
                        )}
                        {exportButton(
                            ExportTypes.ZUGFERD_CII,
                            _t("actions.exportZugferdCii"),
                            _t("actions.exportZugferdHint")
                        )}
                    </div>

                    {/*
                     * The ZUGFeRD PDF hybrid is gone with server-side PDF
                     * generation: it attached the XML to a generated PDF, and
                     * there is no PDF file to attach to any more. The plain
                     * ZUGFeRD CII XML above is the same EN 16931 content.
                     */}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default InvoiceExportModal;
