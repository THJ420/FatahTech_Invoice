// Helpers
import { formatPriceToString } from "@/lib/helpers";

// Types
import type { InvoiceType } from "@/types";

/** Presentation choices kept from the invoice the user is already editing. */
type SampleOverrides = {
    pdfTemplate?: number;
    theme?: InvoiceType["details"]["theme"];
};

const CURRENCY = "USD";
const DISCOUNT_PERCENT = 5;
const TAX_PERCENT = 21;

/**
 * The schema transforms both date fields into display strings on their way out,
 * so `InvoiceType` declares them as `string` — but the form holds real `Date`
 * objects, which is what the date pickers and the template both read. The cast
 * is named here so the reason travels with it.
 */
const asFormDate = (date: Date) => date as unknown as string;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A complete, valid invoice, used by the "Fill in the form" button.
 *
 * It is deliberately a *finished* invoice rather than a plausible one: two
 * parties with every field set, four line items, a percentage discount and a
 * percentage tax, bank details, notes, terms, and a header and footer band. The
 * point is to show what the product produces, so anything left blank would be
 * the part the user has to imagine.
 *
 * Totals are computed here rather than hardcoded so the sample cannot drift
 * from its own line items — the charges context recalculates them anyway, but a
 * mismatch would show for one frame in the summary.
 */
export function buildSampleInvoice({
    pdfTemplate,
    theme,
}: SampleOverrides = {}): InvoiceType {
    const items = [
        {
            name: "Brand identity system",
            description:
                "Logo suite, type scale, colour tokens and a usage guide.",
            quantity: 1,
            unitPrice: 2400,
            total: 2400,
        },
        {
            name: "Website design",
            description: "Six page templates, desktop and mobile.",
            quantity: 1,
            unitPrice: 3200,
            total: 3200,
        },
        {
            name: "Front-end implementation",
            description:
                "Next.js build, responsive layout, accessible components.",
            quantity: 1,
            unitPrice: 4800,
            total: 4800,
        },
        {
            name: "Content migration",
            description: "Copy, imagery and redirects from the previous site.",
            quantity: 6,
            unitPrice: 120,
            total: 720,
        },
    ];

    const subTotal = items.reduce((sum, item) => sum + item.total, 0);
    const afterDiscount = subTotal - subTotal * (DISCOUNT_PERCENT / 100);
    const total = afterDiscount + afterDiscount * (TAX_PERCENT / 100);

    const today = new Date();
    const dueDate = new Date(today.getTime() + 30 * DAY_MS);

    return {
        sender: {
            name: "Northwind Studio",
            address: "48 Harbour Road, Unit 3",
            zipCode: "1017 CD",
            city: "Amsterdam",
            country: "Netherlands",
            email: "billing@northwind.studio",
            phone: "+31 20 555 0148",
            customInputs: [
                { key: "VAT number", value: "NL861234567B01" },
                { key: "Chamber of Commerce", value: "KvK 84512097" },
            ],
        },
        receiver: {
            name: "Contoso Retail",
            address: "Keizersgracht 210",
            zipCode: "1016 DW",
            city: "Amsterdam",
            country: "Netherlands",
            email: "accounts@contoso.example",
            phone: "+31 20 555 0192",
            customInputs: [
                { key: "Purchase contact", value: "M. de Vries" },
                { key: "Reference", value: "Retail site refresh" },
            ],
        },
        details: {
            invoiceLogo: "",
            invoiceNumber: "INV-2026-0042",
            invoiceDate: asFormDate(today),
            dueDate: asFormDate(dueDate),
            purchaseOrderNumber: "PO-2026-0117",
            currency: CURRENCY,
            language: "English",
            items,
            taxDetails: {
                amount: TAX_PERCENT,
                amountType: "percentage",
                taxID: "NL861234567B01",
            },
            discountDetails: {
                amount: DISCOUNT_PERCENT,
                amountType: "percentage",
            },
            shippingDetails: {
                cost: 0,
                costType: "amount",
            },
            paymentInformation: {
                bankName: "ING Business",
                accountName: "Northwind Studio",
                accountNumber: "NL91 INGB 0006 3000 41",
            },
            additionalNotes:
                "Thank you for your business. Payment is due within 30 days of the invoice date; please quote the invoice number with your transfer.",
            paymentTerms: "Net 30",
            subTotal,
            totalAmount: total,
            totalAmountInWords: formatPriceToString(total, CURRENCY),
            headerText: "Northwind Studio · VAT NL861234567B01",
            footerText:
                "Registered in Amsterdam · KvK 84512097 · IBAN NL91 INGB 0006 3000 41",
            signature: { data: "" },
            pdfTemplate: pdfTemplate ?? 1,
            theme: theme ?? {
                accentColor: "#2563EB",
                fontId: "outfit",
                density: "comfortable",
            },
        },
    };
}
