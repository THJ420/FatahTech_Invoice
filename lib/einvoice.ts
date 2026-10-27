import type {
    AllowanceCharge,
    Invoice as En16931Invoice,
    Line,
    Party,
    Payment,
    TaxCategory,
} from "@conformo/core";
import { fromMajor, lineNet, mulRound } from "@conformo/core";
import {
    buildCII,
    buildXRechnungCII,
    buildXRechnungUBL,
    checkXRechnung,
} from "@conformo/formats";

// Helpers
import { clampPercentage, toFiniteNumber } from "@/lib/safeNumber";

// Variables
import { LOCALES } from "@/lib/variables";

// Types
import type { InvoiceType } from "@/types";

/**
 * e-invoice export (EN 16931 / XRechnung / ZUGFeRD).
 *
 * The app's own invoice shape is a form, not a standard: dates are display
 * strings, country is free text, tax is one document-level amount and bank
 * details are three loose strings. EN 16931 wants ISO dates, ISO country codes,
 * per-line VAT categories and integer minor units. This module is the single
 * translation between the two.
 *
 * Everything here is pure and server-side: the serializers are ~40KB of ESM
 * with no native dependencies, so an export costs a few milliseconds.
 */

/** The three XML flavours the export modal offers. */
export type EInvoiceXmlFormat =
    | "XRECHNUNG_UBL"
    | "XRECHNUNG_CII"
    | "ZUGFERD_CII";

/** File name Factur-X/ZUGFeRD readers look for inside the PDF. */
export const FACTURX_ATTACHMENT_NAME = "factur-x.xml";

/**
 * A mapping problem the user can fix — a country typed as "Germany" is fine,
 * a country typed as "??" is not. Kept distinct from a programming error so
 * the route can return 422 with a useful message instead of a generic 500.
 */
export class EInvoiceMappingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EInvoiceMappingError";
    }
}

/**
 * Country resolution.
 *
 * The form stores a free-text country ("Germany", "Deutschland", "USA"), while
 * EN 16931 requires an ISO 3166-1 alpha-2 code. Intl.DisplayNames can turn a
 * code into a name in every language the app ships, so the index is built from
 * that rather than from a hand-maintained table. A small alias map covers the
 * names people actually type that are not the CLDR display name.
 */
const COUNTRY_CODES =
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
        " "
    );

const COUNTRY_CODE_SET = new Set(COUNTRY_CODES);

const COUNTRY_ALIASES: Record<string, string> = {
    america: "US",
    "britain": "GB",
    "czech republic": "CZ",
    "england": "GB",
    "great britain": "GB",
    "holland": "NL",
    "ivory coast": "CI",
    "north korea": "KP",
    "south korea": "KR",
    "the netherlands": "NL",
    "uae": "AE",
    "uk": "GB",
    "united states of america": "US",
    "usa": "US",
    "u.s.": "US",
    "u.s.a.": "US",
    // Common local-language names that CLDR may not return for the locale the
    // invoice is written in.
    "deutschland": "DE",
    "osterreich": "AT",
    "suisse": "CH",
    "schweiz": "CH",
    "españa": "ES",
    "espana": "ES",
    "italia": "IT",
    "brasil": "BR",
    "mexico": "MX",
    "türkiye": "TR",
    "turkiye": "TR",
    "中国": "CN",
    "日本": "JP",
    "대한민국": "KR",
    "россия": "RU",
    "україна": "UA",
};

let countryIndex: Map<string, string> | null = null;

function normalizeCountryKey(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function buildCountryIndex(): Map<string, string> {
    const index = new Map<string, string>();

    for (const alias of Object.keys(COUNTRY_ALIASES)) {
        index.set(normalizeCountryKey(alias), COUNTRY_ALIASES[alias]);
    }

    const locales = Array.from(
        new Set([...LOCALES.map((locale) => locale.code), "en"])
    );

    for (const locale of locales) {
        let display: Intl.DisplayNames;
        try {
            display = new Intl.DisplayNames([locale], { type: "region" });
        } catch {
            continue;
        }

        for (const code of COUNTRY_CODES) {
            let name: string | undefined;
            try {
                name = display.of(code);
            } catch {
                continue;
            }

            if (!name || name === code) continue;

            const key = normalizeCountryKey(name);
            if (!index.has(key)) index.set(key, code);
        }
    }

    return index;
}

/**
 * Resolves a country name or code to ISO 3166-1 alpha-2.
 *
 * Throws rather than guessing: an invalid code produces XML that a recipient's
 * validator rejects long after the user has closed the tab, so failing here
 * with the offending value is the kinder behaviour.
 */
export function resolveCountryCode(value: string): string {
    const raw = value.trim();
    if (!raw) throw new EInvoiceMappingError("A country is required.");

    const upper = raw.toUpperCase();
    if (COUNTRY_CODE_SET.has(upper)) return upper;

    countryIndex ??= buildCountryIndex();
    const code = countryIndex.get(normalizeCountryKey(raw));
    if (code) return code;

    throw new EInvoiceMappingError(
        `"${raw}" is not a recognised country. Enter the two-letter ISO 3166-1 code (for example DE for Germany).`
    );
}

/**
 * ISO date (YYYY-MM-DD).
 *
 * The form holds either a Date (before submit) or the display string produced
 * by the schema ("January 15, 2026"). A bare `YYYY-MM-DD` string is returned
 * untouched: `new Date("2026-01-15")` is UTC midnight, and reading local date
 * parts from it would shift the invoice a day backwards west of Greenwich.
 */
export function toIsoDate(value: unknown, label: string): string {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return value.trim();
    }

    const date =
        value instanceof Date
            ? value
            : typeof value === "string" || typeof value === "number"
              ? new Date(value)
              : null;

    if (!date || Number.isNaN(date.getTime())) {
        throw new EInvoiceMappingError(`${label} is not a valid date.`);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * The form has one document-level tax amount, not a per-line rate. When the
 * amount is a percentage that *is* the rate; when it is an absolute amount the
 * effective rate is tax / subtotal. EN 16931 has no way to express "a fixed
 * amount of tax", so this is the closest faithful mapping.
 */
function resolveTaxRate(invoice: InvoiceType): number {
    const tax = invoice.details.taxDetails;
    const amount = toFiniteNumber(tax?.amount);
    if (amount <= 0) return 0;

    if (tax?.amountType === "percentage") {
        return clampPercentage(amount);
    }

    const subTotal = toFiniteNumber(invoice.details.subTotal);
    if (subTotal <= 0) return 0;

    return Math.min(
        100,
        Math.round((amount / subTotal) * 10_000) / 100
    );
}

/** True for a value shaped like a VAT ID (DE123456789), false for an EIN. */
function looksLikeVatId(value: string): boolean {
    return /^[A-Za-z]{2}[0-9A-Za-z]{2,14}$/.test(value.replace(/\s+/g, ""));
}

/** An IBAN is two letters, two digits, then up to 30 alphanumerics. */
function looksLikeIban(value: string): boolean {
    return /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}$/.test(
        value.replace(/\s+/g, "")
    );
}

function toParty(
    party: InvoiceType["sender"],
    options: { includeContact: boolean }
): Party {
    const email = party.email?.trim();
    const phone = party.phone?.trim();
    const name = party.name?.trim();

    const contact =
        options.includeContact && (name || phone || email)
            ? {
                  name: name || undefined,
                  phone: phone || undefined,
                  email: email || undefined,
              }
            : undefined;

    return {
        name: name || party.name,
        street: party.address?.trim() || undefined,
        city: party.city?.trim() || undefined,
        postcode: party.zipCode?.trim() || undefined,
        country: resolveCountryCode(party.country),
        // BT-34 / BT-49. XRechnung expects an electronic address; e-mail with
        // EAS code EM is the one every small business already has.
        electronicAddress: email || undefined,
        electronicAddressScheme: email ? "EM" : undefined,
        contact,
    };
}

function buildPayment(invoice: InvoiceType): Payment {
    const bank = invoice.details.paymentInformation;
    const accountNumber = bank?.accountNumber?.trim() ?? "";
    const bankName = bank?.bankName?.trim() ?? "";
    const accountName = bank?.accountName?.trim() ?? "";

    const hasBankDetails = Boolean(bankName || accountName || accountNumber);
    const iban = looksLikeIban(accountNumber)
        ? accountNumber.replace(/\s+/g, "").toUpperCase()
        : undefined;

    /*
     * UNTDID 4461: 30 is a plain credit transfer, 1 is "instrument not
     * defined". Code 1 is the honest choice when the invoice carries no bank
     * details at all; a made-up SEPA code would tell the recipient to pay by a
     * method the document does not describe.
     */
    const meansText = [
        bankName || undefined,
        accountNumber && !iban ? `Account ${accountNumber}` : undefined,
    ]
        .filter(Boolean)
        .join(" · ");

    return {
        meansCode: hasBankDetails ? "30" : "1",
        meansText: meansText || undefined,
        // BT-83. The invoice number is what a payer should quote.
        reference: invoice.details.invoiceNumber,
        iban,
        accountName: accountName || undefined,
    };
}

function buildAllowance(
    amountValue: unknown,
    amountType: string | undefined,
    subtotalMinor: number,
    taxCategory: TaxCategory,
    taxRate: number,
    reason: string
): AllowanceCharge | undefined {
    const amount = toFiniteNumber(amountValue);
    if (amount <= 0) return undefined;

    const isPercentage = amountType === "percentage";
    const percent = isPercentage ? clampPercentage(amount) : undefined;
    const amountMinor = isPercentage
        ? mulRound(subtotalMinor, percent!, 100)
        : fromMajor(amount);

    if (amountMinor <= 0) return undefined;

    return {
        amountMinor,
        baseAmountMinor: subtotalMinor,
        percent,
        reason,
        taxCategory,
        taxRate,
    };
}

/**
 * Maps the form to the EN 16931 semantic model.
 *
 * Deliberately not exported as a general-purpose conversion: callers should go
 * through `buildEInvoiceXml`, which also handles serialization errors and file
 * naming.
 */
export function toEn16931Invoice(invoice: InvoiceType): En16931Invoice {
    const { details } = invoice;

    if (!details.items || details.items.length === 0) {
        throw new EInvoiceMappingError(
            "An e-invoice needs at least one line item."
        );
    }

    const taxRate = resolveTaxRate(invoice);
    const taxCategory: TaxCategory = taxRate > 0 ? "S" : "Z";

    const lines: Line[] = details.items.map((item) => ({
        name: item.name,
        description: item.description?.trim() || undefined,
        quantity: Math.max(0, toFiniteNumber(item.quantity)),
        unitPriceMinor: fromMajor(toFiniteNumber(item.unitPrice)),
        // UN/ECE Recommendation 20: C62 is "one", the unit the form implies.
        unitCode: "C62",
        taxCategory,
        taxRate,
        ...(taxRate === 0
            ? { exemptionReason: "Zero rated" }
            : {}),
    }));

    const subtotalMinor = lines.reduce(
        (sum, line) =>
            sum +
            lineNet({
                quantity: line.quantity,
                unitPriceMinor: line.unitPriceMinor,
            }),
        0
    );

    const discount = buildAllowance(
        details.discountDetails?.amount,
        details.discountDetails?.amountType,
        subtotalMinor,
        taxCategory,
        taxRate,
        "Discount"
    );

    const shipping = buildAllowance(
        details.shippingDetails?.cost,
        details.shippingDetails?.costType,
        subtotalMinor,
        taxCategory,
        taxRate,
        "Shipping"
    );

    const taxId = details.taxDetails?.taxID?.trim();
    const seller = toParty(invoice.sender, { includeContact: true });
    if (taxId) {
        if (looksLikeVatId(taxId)) {
            seller.vatId = taxId;
        } else {
            seller.taxRegistrationId = taxId;
        }
    }

    const orderReference = details.purchaseOrderNumber?.trim() || undefined;
    const additionalNotes = details.additionalNotes?.trim();

    return {
        number: details.invoiceNumber,
        issueDate: toIsoDate(details.invoiceDate, "The invoice date"),
        dueDate: toIsoDate(details.dueDate, "The due date"),
        currency: details.currency,
        /*
         * BT-10. XRechnung requires it (BR-DE-15); for public-sector buyers it
         * is the Leitweg-ID. The purchase order number is the closest thing the
         * form collects, and falling back to the invoice number keeps a private
         * B2B invoice exportable instead of failing outright.
         */
        buyerReference: orderReference || details.invoiceNumber,
        orderReference,
        paymentTerms: details.paymentTerms?.trim() || undefined,
        notes: additionalNotes ? [{ text: additionalNotes }] : undefined,
        seller,
        buyer: toParty(invoice.receiver, { includeContact: true }),
        payment: buildPayment(invoice),
        lines,
        allowances: discount ? [discount] : undefined,
        charges: shipping ? [shipping] : undefined,
    };
}

/**
 * XRechnung's own precondition check, exposed so the route can return the
 * missing fields as a list instead of a thrown error string.
 */
export function xrechnungIssues(invoice: En16931Invoice) {
    return checkXRechnung(invoice);
}

/** Sanitises an invoice number for use in a download file name. */
export function invoiceFileStem(invoiceNumber: string): string {
    const stem = invoiceNumber
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, "")
        .slice(0, 60);

    return stem || "invoice";
}

/**
 * Serializes an invoice in the requested XML flavour.
 *
 * XRechnung throws `XRechnungError` when a German-mandatory term is missing;
 * the route catches it and reports the issues. ZUGFeRD uses the plain EN 16931
 * CII profile, which has no German-only requirements.
 */
export function buildEInvoiceXml(
    invoice: InvoiceType,
    format: EInvoiceXmlFormat
): { xml: string; filename: string } {
    const model = toEn16931Invoice(invoice);
    const stem = invoiceFileStem(model.number);

    switch (format) {
        case "XRECHNUNG_UBL":
            return {
                xml: buildXRechnungUBL(model),
                filename: `${stem}-xrechnung-ubl.xml`,
            };
        case "XRECHNUNG_CII":
            return {
                xml: buildXRechnungCII(model),
                filename: `${stem}-xrechnung-cii.xml`,
            };
        case "ZUGFERD_CII":
            return {
                xml: buildCII(model, { profile: "en16931" }),
                filename: `${stem}-zugferd-cii.xml`,
            };
    }
}
