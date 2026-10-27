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
    SignatureBlock,
} from "../parts";

// Number guards
import { toFiniteNumber } from "@/lib/safeNumber";

/**
 * Packing List — the same shipment data as an invoice, but quantities instead
 * of money. Prices are omitted entirely rather than blanked out, because a
 * packing list that shows a rate column invites the recipient to treat it as
 * an invoice.
 */
export default function PackingList(props: TemplateProps) {
    const ctx = templateCtx(props);
    const { data, labels, theme, scale } = ctx;

    const totalItems = data.details.items.length;
    const totalQuantity = data.details.items.reduce(
        (sum, item) => sum + toFiniteNumber(item.quantity),
        0
    );

    return (
        <TemplateFrame ctx={ctx}>
            <header>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <Logo {...ctx} />
                    <div className="text-end">
                        <div
                            className={`${scale.heading} font-semibold uppercase tracking-tight text-gray-900`}
                        >
                            {labels.packingList}
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
                <DocumentMeta ctx={ctx} showDueDate={false} />
            </div>

            <div className={scale.sectionGap}>
                <ItemsTable ctx={ctx} showPrices={false} />
            </div>

            <div
                className={`${scale.sectionGap} flex flex-wrap justify-end gap-x-8 gap-y-2 border-t border-gray-200 pt-3`}
            >
                <div className="text-end">
                    <p className={`${scale.label} uppercase tracking-wider text-gray-500`}>
                        {labels.totalItems}
                    </p>
                    <p className={`${scale.body} font-semibold tabular-nums text-gray-900`}>
                        {totalItems}
                    </p>
                </div>
                <div className="text-end">
                    <p className={`${scale.label} uppercase tracking-wider text-gray-500`}>
                        {labels.totalQuantity}
                    </p>
                    <p className={`${scale.body} font-semibold tabular-nums text-gray-900`}>
                        {totalQuantity}
                    </p>
                </div>
            </div>

            <div className={`${scale.sectionGap} grid gap-6 sm:grid-cols-2`}>
                <NotesBlock ctx={ctx} showPaymentTerms={false} />
            </div>

            <div className={`${scale.sectionGap} flex items-end justify-between gap-6`}>
                <ContactFooter ctx={ctx} />
                <SignatureBlock ctx={ctx} />
            </div>
        </TemplateFrame>
    );
}
