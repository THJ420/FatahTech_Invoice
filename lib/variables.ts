// Types
import { SignatureColor, SignatureFont } from "@/types";

/**
 * Environment
 */
export const ENV = process.env.NODE_ENV;

/**
 * Brand
 */
export const BRAND_NAME = "FatahTech Invoice";
export const BRAND_SHORT = "FatahTech";
export const BRAND_URL = "https://fatahtech.com";

/**
 * Websites
 */
/**
 * Canonical origin, used for metadataBase, canonicals, hreflang, the sitemap
 * and JSON-LD.
 *
 * This app is the invoice tool at invoice.fatahtech.com, not the marketing site
 * — falling back to BRAND_URL made every canonical, OG URL and sitemap entry
 * point at the parent domain. Read from the environment so a preview
 * deployment or a future custom domain does not need a code change. No
 * trailing slash.
 */
export const BASE_URL = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://invoice.fatahtech.com"
).replace(/\/$/, "");

/**
 * API endpoints
 */
export const EXPORT_INVOICE_API = "/api/invoice/export";

/**
 * External API endpoints
 */
export const CURRENCIES_API =
    "https://openexchangerates.org/api/currencies.json";

/**
 * Local storage
 */
export const LOCAL_STORAGE_INVOICE_DRAFT_KEY = "fatahtech:invoiceDraft";

/**
 * Trailing debounce for the draft autosave. Long enough that ordinary typing
 * never triggers a write, short enough that the "Saved" indicator settles while
 * the user is still looking at it.
 */
export const DRAFT_SAVE_DEBOUNCE_MS = 600;

/**
 * Google
 */
export const GOOGLE_SC_VERIFICATION = process.env.GOOGLE_SC_VERIFICATION;

/**
 * I18N
 */
/**
 * Every locale the app ships, unordered. `LOCALES` below is the ordered list
 * that the switcher, the sitemap and next-intl's routing all read.
 */
const LOCALE_CATALOGUE = [
    { code: "en", name: "English" },
    { code: "az", name: "Azərbaycanca" },
    { code: "de", name: "Deutsch" },
    { code: "it", name: "Italiano" },
    { code: "es", name: "Español" },
    { code: "ca", name: "Català" },
    { code: "fr", name: "Français" },
    { code: "ar", name: "العربية" },
    { code: "pl", name: "Polish" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "tr", name: "Türkçe" },
    { code: "zh-CN", name: "简体中文" },
    { code: "ja", name: "日本語" },
    { code: "nb-NO", name: "Norwegian (bokmål)" },
    { code: "nn-NO", name: "Norwegian (nynorsk)" },
    // id.json and sr.json shipped in i18n/locales but were never registered
    // here, so those locales were unreachable and fell back to the default.
    { code: "id", name: "Bahasa Indonesia" },
    { code: "sr", name: "Српски" },
    { code: "he", name: "עברית" },
];

/**
 * Pinned to the top of the switcher by request. DEFAULT_LOCALE reads
 * LOCALES[0].code, so English must stay first of these two.
 */
const PINNED_LOCALES = ["en", "az"];

/**
 * The switcher shows each language under its own name, so that is what the
 * order is built from — sorting by English name would look arbitrary next to
 * "Deutsch" and "日本語".
 *
 * Intl.Collator's root order alphabetises the Latin-script names and then
 * groups the remaining scripts after them (Cyrillic, Hebrew, Arabic, then
 * Han/kana), which is a readable result for a mixed-script list. Computed once
 * at module load rather than per render.
 */
const localeCollator = new Intl.Collator("en", { sensitivity: "base" });

export const LOCALES = [
    ...PINNED_LOCALES.map(
        (code) => LOCALE_CATALOGUE.find((locale) => locale.code === code)!
    ),
    ...LOCALE_CATALOGUE.filter(
        (locale) => !PINNED_LOCALES.includes(locale.code)
    ).sort((a, b) => localeCollator.compare(a.name, b.name)),
];
export const DEFAULT_LOCALE = LOCALES[0].code;

/**
 * Writing direction per locale.
 *
 * Arabic has been in LOCALES since before this branch and has been rendering
 * right-to-left text inside a left-to-right layout the whole time — <html> was
 * emitted with `lang` but no `dir` at all. Hebrew joins it here, and both now
 * get a real direction.
 */
export const RTL_LOCALES = new Set(["ar", "he"]);

export const dirForLocale = (locale: string): "rtl" | "ltr" =>
    RTL_LOCALES.has(locale) ? "rtl" : "ltr";

/**
 * Signature variables
 */
export const SIGNATURE_COLORS: SignatureColor[] = [
    { name: "black", label: "Black", color: "rgb(0, 0, 0)" },
    { name: "dark blue", label: "Dark Blue", color: "rgb(0, 0, 128)" },
    {
        name: "crimson",
        label: "Crimson",
        color: "#DC143C",
    },
];

export const SIGNATURE_FONTS: SignatureFont[] = [
    {
        name: "Dancing Script",
        variable: "var(--font-dancing-script)",
    },
    { name: "Parisienne", variable: "var(--font-parisienne)" },
    {
        name: "Great Vibes",
        variable: "var(--font-great-vibes)",
    },
    {
        name: "Alex Brush",
        variable: "var(--font-alex-brush)",
    },
];

/**
 * Form date options
 */
export const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
};

export const SHORT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
};

/**
 * Form defaults
 */
export const FORM_DEFAULT_VALUES = {
    sender: {
        name: "",
        address: "",
        zipCode: "",
        city: "",
        country: "",
        email: "",
        phone: "",
        customInputs: [],
    },
    receiver: {
        name: "",
        address: "",
        zipCode: "",
        city: "",
        country: "",
        email: "",
        phone: "",
        customInputs: [],
    },
    details: {
        invoiceLogo: "",
        invoiceNumber: "",
        invoiceDate: "",
        dueDate: "",
        items: [
            {
                name: "",
                description: "",
                quantity: 0,
                unitPrice: 0,
                total: 0,
            },
        ],
        currency: "USD",
        language: "English",
        taxDetails: {
            amount: 0,
            amountType: "amount",
            taxID: "",
        },
        discountDetails: {
            amount: 0,
            amountType: "amount",
        },
        shippingDetails: {
            cost: 0,
            costType: "amount",
        },
        paymentInformation: {
            bankName: "",
            accountName: "",
            accountNumber: "",
        },
        additionalNotes: "",
        paymentTerms: "",
        totalAmountInWords: "",
        headerText: "",
        footerText: "",
        pdfTemplate: 1,
        // `as const` so fontId/density keep their literal types and satisfy the
        // enums in ThemeSchema rather than widening to string.
        theme: {
            accentColor: "#2563EB",
            fontId: "outfit",
            density: "comfortable",
        } as const,
    },
};

