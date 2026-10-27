import TemplateFrame, {
    templateCtx,
    type TemplateProps,
} from "../TemplateFrame";
import {
    ContactFooter,
    DocumentMeta,
    ItemsTable,
    Logo,
    NotesBlock,
    PartyBlock,
    PaymentBlock,
    SignatureBlock,
    TotalsBlock,
} from "../parts";

/**
 * Proforma — a quotation-style document that reuses the invoice data but is
 * explicitly titled "Proforma Invoice". The layout is the Modern arrangement,
 * which is deliberately familiar: a proforma is usually sent to the same
 * customer who will receive the final invoice, so it should look like the
 * document that follows it.
 */
export default function Proforma(props: TemplateProps) {
    const ctx = templateCtx(props);
    const { data, labels, theme, scale } = ctx;

    return (
        <TemplateFrame ctx={ctx}>
            <header>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <Logo {...ctx} />
                    <div className="text-end">
                        <div
                            className={`${scale.heading} font-semibold uppercase tracking-tight text-gray-900`}
                        >
                            {labels.proformaInvoice}
                        </div>
                        <div
                            className={`${scale.body} mt-1 font-medium tabular-nums`}
                            style={{ color: theme.accentColor }}
                        >
                            {labels.invoiceNumber} {data.details.invoiceNumber}
                        </div>
                    </div>
                </div>
                <div
                    className="mt-3 h-1 w-full rounded"
                    style={{ backgroundColor: theme.accentColor }}
                    aria-hidden="true"
                />
            </header>

            <div className={`${scale.sectionGap} grid gap-6 sm:grid-cols-2`}>
                <PartyBlock
                    ctx={ctx}
                    field="sender"
                    party={data.sender}
                    heading={labels.from}
                />
                <PartyBlock
                    ctx={ctx}
                    field="receiver"
                    party={data.receiver}
                    heading={labels.billTo}
                    align="right"
                />
            </div>

            <div className={`${scale.sectionGap} flex justify-end`}>
                <DocumentMeta ctx={ctx} />
            </div>

            <div className={scale.sectionGap}>
                <ItemsTable ctx={ctx} />
            </div>

            <div className={`${scale.sectionGap} flex justify-end`}>
                <div className="w-full sm:w-1/2">
                    <TotalsBlock ctx={ctx} />
                </div>
            </div>

            <div className={`${scale.sectionGap} grid gap-6 sm:grid-cols-2`}>
                <NotesBlock ctx={ctx} />
                <PaymentBlock ctx={ctx} />
            </div>

            <div className={`${scale.sectionGap} flex items-end justify-between gap-6`}>
                <ContactFooter ctx={ctx} />
                <SignatureBlock ctx={ctx} />
            </div>
        </TemplateFrame>
    );
}
