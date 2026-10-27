// Helpers
import { formatPriceToString } from "@/lib/helpers";
import {
    MAX_AMOUNT,
    MAX_LINE_TOTAL,
    MAX_QUANTITY,
    clampNumber,
    clampPercentage,
    safeLineTotal,
} from "@/lib/safeNumber";

// Variables
import { DATE_OPTIONS } from "@/lib/variables";

// Template theme
import type {
    InvoiceDensity,
    InvoiceFontId,
} from "@/app/components/templates/invoice-pdf/invoiceTheme";

// Types
import type { InvoiceType, ItemType } from "@/types";

export const MAX_BULK_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_BULK_ROWS = 10_000;
export const MAX_BULK_INVOICES = 500;

export type BulkFieldKey =
    | "invoiceNumber"
    | "invoiceDate"
    | "dueDate"
    | "senderName"
    | "senderEmail"
    | "clientName"
    | "clientEmail"
    | "clientAddress"
    | "itemDescription"
    | "itemQuantity"
    | "itemRate"
    | "taxRate"
    | "discount"
    | "shipping";

export type BulkField = {
    key: BulkFieldKey;
    label: string;
    required?: boolean;
};

/** The columns the wizard can map, in the order the form asks for them. */
export const BULK_FIELDS: BulkField[] = [
    { key: "invoiceNumber", label: "Invoice Number", required: true },
    { key: "invoiceDate", label: "Invoice Date" },
    { key: "dueDate", label: "Due Date" },
    { key: "senderName", label: "Sender Name" },
    { key: "senderEmail", label: "Sender Email" },
    { key: "clientName", label: "Client Name", required: true },
    { key: "clientEmail", label: "Client Email" },
    { key: "clientAddress", label: "Client Address" },
    { key: "itemDescription", label: "Item Description", required: true },
    { key: "itemQuantity", label: "Item Quantity", required: true },
    { key: "itemRate", label: "Item Rate", required: true },
    { key: "taxRate", label: "Tax Rate (%)" },
    { key: "discount", label: "Discount (%)" },
    { key: "shipping", label: "Shipping" },
];

export const BULK_REQUIRED_FIELDS: BulkFieldKey[] = BULK_FIELDS.filter(
    (field) => field.required
).map((field) => field.key);

export type SpreadsheetRow = Record<string, unknown>;

export type SpreadsheetData = {
    fileName: string;
    sheetName: string;
    headers: string[];
    rows: SpreadsheetRow[];
};

export type HeaderMapping = Partial<Record<BulkFieldKey, string>>;

export type BulkStyle = {
    templateId: number;
    fontId: InvoiceFontId;
    density: InvoiceDensity;
    accentColor: string;
};

export type BulkIssue = {
    /** Spreadsheet row number, 1-based including the header row. */
    row: number;
    message: string;
    severity: "error" | "warning";
};

export type BulkBuildResult = {
    invoices: InvoiceType[];
    issues: BulkIssue[];
};

const HEADER_ALIASES: Record<BulkFieldKey, string[]> = {
    invoiceNumber: [
        "invoice number",
        "invoice no",
        "invoice #",
        "invoice id",
        "invoice",
        "number",
    ],
    invoiceDate: ["invoice date", "issue date", "date", "billing date"],
    dueDate: ["due date", "payment due", "due", "payment due date"],
    senderName: [
        "sender name",
        "sender",
        "from",
        "from name",
        "company",
        "company name",
        "business name",
    ],
    senderEmail: [
        "sender email",
        "from email",
        "billing email",
        "sender e mail",
    ],
    clientName: [
        "client name",
        "client",
        "customer",
        "customer name",
        "bill to",
        "receiver",
        "buyer",
        "buyer name",
    ],
    clientEmail: [
        "client email",
        "customer email",
        "client e mail",
        "receiver email",
        "email",
    ],
    clientAddress: [
        "client address",
        "customer address",
        "billing address",
        "receiver address",
        "address",
    ],
    itemDescription: [
        "item description",
        "description",
        "item",
        "item name",
        "product",
        "product name",
        "service",
    ],
    itemQuantity: ["item quantity", "quantity", "qty", "units", "hours"],
    itemRate: ["item rate", "rate", "unit price", "unit rate", "price"],
    taxRate: ["tax rate", "tax rate (%)", "tax %", "vat", "vat rate", "tax"],
    discount: ["discount", "discount (%)", "discount %", "discount rate"],
    shipping: [
        "shipping",
        "shipping cost",
        "shipping amount",
        "delivery",
        "freight",
    ],
};

const normalizeHeader = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .trim();

/**
 * Picks the most likely column for every target field.
 *
 * Exact matches win over substring matches, so a sheet with both "Email" and
 * "Client Email" maps Client Email to the specific one rather than whichever
 * column happened to come first.
 */
export function autoMapHeaders(headers: string[]): HeaderMapping {
    const normalized = headers.map((header) => ({
        header,
        value: normalizeHeader(header),
    }));
    const mapping: HeaderMapping = {};

    for (const field of BULK_FIELDS) {
        const aliases = HEADER_ALIASES[field.key]
            .map(normalizeHeader)
            .filter(Boolean);

        const exact = aliases
            .map((alias) => normalized.find((entry) => entry.value === alias))
            .find(Boolean);

        if (exact) {
            mapping[field.key] = exact.header;
            continue;
        }

        const partial = aliases
            .map((alias) =>
                normalized.find((entry) => entry.value.includes(alias))
            )
            .find(Boolean);

        if (partial) mapping[field.key] = partial.header;
    }

    return mapping;
}

const cellText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? ""
            : value.toISOString().slice(0, 10);
    }
    return String(value).trim();
};

const uniqueHeaders = (row: unknown[], width: number): string[] => {
    const seen = new Map<string, number>();

    return Array.from({ length: width }, (_, index) => {
        const base = cellText(row[index]) || `Column ${index + 1}`;
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        return count === 1 ? base : `${base} (${count})`;
    });
};

/**
 * Reads the first sheet of a CSV/XLS/XLSX file in the browser.
 *
 * SheetJS handles all three formats, including legacy BIFF `.xls`, and never
 * touches the network. `cellDates` means a real date-typed cell arrives as a
 * Date rather than a serial number; CSV dates arrive as strings and are
 * parsed later.
 */
export async function parseSpreadsheet(file: File): Promise<SpreadsheetData> {
    if (file.size > MAX_BULK_FILE_BYTES) {
        throw new Error(
            `This file is larger than ${Math.round(
                MAX_BULK_FILE_BYTES / 1024 / 1024
            )} MB. Split it into smaller batches.`
        );
    }

    /*
     * SheetJS is the largest dependency in this feature (the parser plus its
     * codepage tables). Importing it here — rather than at module scope —
     * keeps it out of the builder's initial bundle and loads it on the first
     * file the user actually drops.
     */
    const XLSX = await import("@e965/xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), {
        type: "array",
        cellDates: true,
    });

    const sheetName = workbook.SheetNames.find((name) => workbook.Sheets[name]);

    if (!sheetName) throw new Error("The file contains no readable sheet.");

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(
        workbook.Sheets[sheetName],
        {
            header: 1,
            defval: "",
            raw: true,
            blankrows: false,
        }
    );

    if (matrix.length === 0) throw new Error("The file is empty.");

    const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const headers = uniqueHeaders(matrix[0] ?? [], width);

    const rows: SpreadsheetRow[] = [];

    for (const row of matrix.slice(1)) {
        if (!row.some((value) => cellText(value) !== "")) continue;

        const record: SpreadsheetRow = {};
        headers.forEach((header, index) => {
            record[header] = row[index] ?? "";
        });
        rows.push(record);

        if (rows.length > MAX_BULK_ROWS) {
            throw new Error(
                `This batch has more than ${MAX_BULK_ROWS.toLocaleString()} rows. Split it into smaller files.`
            );
        }
    }

    if (rows.length === 0) {
        throw new Error("The file has a header row but no invoice rows.");
    }

    return { fileName: file.name, sheetName, headers, rows };
}

/** Parses "1,234.50", "1.234,50", "€ 99" and plain numbers. */
export function parseBulkNumber(value: unknown): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    let text = String(value ?? "")
        .trim()
        .replace(/[\s\u00a0]/g, "")
        .replace(/[^\d.,-]/g, "");

    if (!text) return 0;

    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");

    if (lastComma !== -1 && lastDot !== -1) {
        text =
            lastComma > lastDot
                ? text.replace(/\./g, "").replace(",", ".")
                : text.replace(/,/g, "");
    } else if (lastComma !== -1) {
        const parts = text.split(",");
        text =
            parts.length === 2 && parts[1].length <= 2
                ? text.replace(",", ".")
                : text.replace(/,/g, "");
    }

    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

const utcNoon = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day, 12));

/** Parses ISO, day-first numeric and free-text dates without timezone drift. */
export function parseBulkDate(value: unknown): Date | null {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        /*
         * SheetJS builds a local-midnight Date from a date-only cell. Reading
         * its UTC parts in a positive-offset timezone moves it to the previous
         * day, so take the calendar date it was constructed with.
         */
        return utcNoon(value.getFullYear(), value.getMonth(), value.getDate());
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        // Excel's 1900 date system, where serial 25569 is 1970-01-01.
        const millis = Math.round((value - 25569) * 86_400_000);
        const date = new Date(millis);
        if (Number.isNaN(date.getTime())) return null;
        return utcNoon(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate()
        );
    }

    const text = String(value ?? "").trim();
    if (!text) return null;

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (iso) {
        const date = utcNoon(
            Number(iso[1]),
            Number(iso[2]) - 1,
            Number(iso[3])
        );
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
    if (numeric) {
        let year = Number(numeric[3]);
        if (year < 100) year += year >= 70 ? 1900 : 2000;

        // Day-first: far more of the world writes 15/01/2026 than 01/15/2026,
        // and a value with a day above 12 is unambiguous anyway.
        const date = utcNoon(year, Number(numeric[2]) - 1, Number(numeric[1]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;

    return utcNoon(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

const displayDate = (date: Date) =>
    date.toLocaleDateString("en-US", { ...DATE_OPTIONS, timeZone: "UTC" });

const addDays = (date: Date, days: number) => {
    const copy = new Date(date.getTime());
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const firstValue = (rows: SpreadsheetRow[], header?: string): unknown => {
    if (!header) return "";
    for (const row of rows) {
        const value = row[header];
        if (cellText(value) !== "") return value;
    }
    return "";
};

type BuildOptions = {
    rows: SpreadsheetRow[];
    mapping: HeaderMapping;
    style: BulkStyle;
    /** The current invoice supplies sender, logo, bank details and terms. */
    base: InvoiceType;
};

/**
 * Turns mapped spreadsheet rows into complete invoices.
 *
 * Rows sharing an Invoice Number become one invoice with several line items;
 * invoice-level fields are read from the first non-empty cell in the group, so
 * repeating them (or leaving them blank after the first row) both work.
 */
export function buildBulkInvoices({
    rows,
    mapping,
    style,
    base,
}: BuildOptions): BulkBuildResult {
    const issues: BulkIssue[] = [];
    const invoices: InvoiceType[] = [];

    if (!mapping.invoiceNumber) {
        return {
            invoices,
            issues: [
                {
                    row: 1,
                    message:
                        "Map the Invoice Number column — it is what groups rows into one invoice.",
                    severity: "error",
                },
            ],
        };
    }

    const groups = new Map<
        string,
        { rows: SpreadsheetRow[]; firstRow: number }
    >();

    let previousNumber = "";

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const rawNumber = cellText(row[mapping.invoiceNumber!]);

        if (rawNumber) previousNumber = rawNumber;

        /*
         * Blank invoice numbers are common on continuation rows, so carry the
         * previous one forward rather than treating the row as a new invoice.
         */
        const invoiceNumber = rawNumber || previousNumber;

        if (!invoiceNumber) {
            issues.push({
                row: rowNumber,
                message: "Missing invoice number; this row was skipped.",
                severity: "error",
            });
            return;
        }

        const group = groups.get(invoiceNumber) ?? {
            rows: [],
            firstRow: rowNumber,
        };
        group.rows.push(row);
        groups.set(invoiceNumber, group);
    });

    if (groups.size > MAX_BULK_INVOICES) {
        return {
            invoices,
            issues: [
                {
                    row: 1,
                    message: `This batch contains ${groups.size.toLocaleString()} invoices; the limit is ${MAX_BULK_INVOICES.toLocaleString()}. Split it into smaller files.`,
                    severity: "error",
                },
            ],
        };
    }

    const currency = base.details.currency || "USD";
    const paymentTerms = base.details.paymentTerms || "Net 30";

    for (const [invoiceNumber, group] of groups) {
        const clientName = cellText(firstValue(group.rows, mapping.clientName));

        if (!clientName) {
            issues.push({
                row: group.firstRow,
                message: `Invoice ${invoiceNumber}: no client name; skipped.`,
                severity: "error",
            });
            continue;
        }

        const items: ItemType[] = [];

        group.rows.forEach((row, index) => {
            const rowNumber = group.firstRow + index;
            const description = cellText(row[mapping.itemDescription ?? ""]);

            if (!description) return;

            const quantity = parseBulkNumber(row[mapping.itemQuantity ?? ""]);
            const rate = parseBulkNumber(row[mapping.itemRate ?? ""]);

            if (quantity <= 0) {
                issues.push({
                    row: rowNumber,
                    message: `Invoice ${invoiceNumber}: item "${description}" has a quantity of 0; row skipped.`,
                    severity: "warning",
                });
                return;
            }

            const safeQuantity = clampNumber(quantity, 0, MAX_QUANTITY);
            const safeRate = clampNumber(rate, 0, MAX_AMOUNT);

            items.push({
                name: description,
                description: "",
                quantity: safeQuantity,
                unitPrice: safeRate,
                total: round2(safeLineTotal(safeQuantity, safeRate)),
            });
        });

        if (items.length === 0) {
            issues.push({
                row: group.firstRow,
                message: `Invoice ${invoiceNumber}: no valid line items; skipped.`,
                severity: "error",
            });
            continue;
        }

        const invoiceDateRaw = firstValue(group.rows, mapping.invoiceDate);
        const dueDateRaw = firstValue(group.rows, mapping.dueDate);

        let invoiceDate = parseBulkDate(invoiceDateRaw);
        if (invoiceDateRaw && !invoiceDate) {
            issues.push({
                row: group.firstRow,
                message: `Invoice ${invoiceNumber}: invoice date could not be read; using today.`,
                severity: "warning",
            });
        }
        const today = new Date();
        invoiceDate =
            invoiceDate ??
            utcNoon(today.getFullYear(), today.getMonth(), today.getDate());

        let dueDate = parseBulkDate(dueDateRaw);
        if (dueDateRaw && !dueDate) {
            issues.push({
                row: group.firstRow,
                message: `Invoice ${invoiceNumber}: due date could not be read; using 30 days after the invoice date.`,
                severity: "warning",
            });
        }
        dueDate = dueDate ?? addDays(invoiceDate, 30);

        const subTotal = round2(
            items.reduce((sum, item) => sum + item.total, 0)
        );
        const discountPercent = clampPercentage(
            parseBulkNumber(firstValue(group.rows, mapping.discount))
        );
        const taxPercent = clampPercentage(
            parseBulkNumber(firstValue(group.rows, mapping.taxRate))
        );
        const shipping = clampNumber(
            parseBulkNumber(firstValue(group.rows, mapping.shipping)),
            0,
            MAX_LINE_TOTAL
        );

        const discount = round2(subTotal * (discountPercent / 100));
        const taxable = Math.max(0, subTotal - discount);
        const tax = round2(taxable * (taxPercent / 100));
        const total = round2(
            clampNumber(taxable + tax + shipping, 0, MAX_LINE_TOTAL)
        );

        invoices.push({
            ...base,
            sender: {
                ...base.sender,
                name:
                    cellText(firstValue(group.rows, mapping.senderName)) ||
                    base.sender.name,
                email:
                    cellText(firstValue(group.rows, mapping.senderEmail)) ||
                    base.sender.email,
                customInputs: base.sender.customInputs ?? [],
            },
            receiver: {
                name: clientName,
                address: cellText(
                    firstValue(group.rows, mapping.clientAddress)
                ),
                zipCode: "",
                city: "",
                country: "",
                email: cellText(firstValue(group.rows, mapping.clientEmail)),
                phone: "",
                customInputs: [],
            },
            details: {
                ...base.details,
                invoiceNumber,
                invoiceDate: displayDate(invoiceDate),
                dueDate: displayDate(dueDate),
                items,
                currency,
                taxDetails: {
                    amount: taxPercent,
                    amountType: "percentage",
                    taxID: base.details.taxDetails?.taxID ?? "",
                },
                discountDetails: {
                    amount: discountPercent,
                    amountType: "percentage",
                },
                shippingDetails: { cost: shipping, costType: "amount" },
                subTotal,
                totalAmount: total,
                totalAmountInWords: formatPriceToString(total, currency),
                paymentTerms,
                theme: {
                    accentColor: style.accentColor,
                    fontId: style.fontId,
                    density: style.density,
                },
                pdfTemplate: style.templateId,
                updatedAt: undefined,
                purchaseOrderNumber: undefined,
            },
        });
    }

    return { invoices, issues };
}
