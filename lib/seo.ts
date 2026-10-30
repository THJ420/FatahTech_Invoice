import {
    BASE_URL,
    BRAND_NAME,
    BRAND_URL,
    DEFAULT_LOCALE,
} from "@/lib/variables";

/**
 * Search vocabulary the product actually answers.
 *
 * These are the phrases the homepage copy and FAQ are written around — a list
 * that no longer matches the page would be the kind of keyword stuffing Google
 * ignores at best and penalises at worst.
 */
export const ROOTKEYWORDS = [
    "free invoice generator",
    "bulk invoice generator",
    "free PDF invoice generator no signup",
    "browser invoice maker",
    "bulk invoice creator from excel",
    "CSV invoice generator",
    "Excel invoice generator",
    "invoice template",
    "invoice templates",
    "PDF invoice",
    "online invoice maker",
    "bulk PDF invoices",
    "invoice generator no signup",
    "fatahtech invoice",
];

/**
 * Locales with complete, human-reviewed copy.
 *
 * Only English qualifies. Every other message file covers part of the tree
 * (208 of 463 keys at best) and none has the homepage sections or the newer
 * FAQ entries, so those pages are partly English behind a translated shell.
 * They stay available to the language switcher, but are not advertised to
 * crawlers — no sitemap entry, no hreflang, and a noindex meta tag — until the
 * copy is actually translated. Add a locale here only when its file is
 * complete.
 */
export const INDEXABLE_LOCALES = ["en"] as const;

export const isIndexableLocale = (locale: string) =>
    (INDEXABLE_LOCALES as readonly string[]).includes(locale);

/** English is unprefixed, every other locale is path-prefixed. */
const localePrefix = (locale: string) =>
    locale === DEFAULT_LOCALE ? "" : `/${locale}`;

/**
 * Path for a locale and optional sub-path.
 *
 * `localePath("en")` is "/" and `localePath("en", "/guide")` is "/guide/";
 * `localePath("az")` is "/az/". Canonicals, hreflang, sitemap entries and
 * JSON-LD URLs all come from here so the default-locale special case exists in
 * exactly one place.
 */
export const localePath = (locale: string, path = "") => {
    const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
    const result = `${localePrefix(locale)}${suffix}`;
    if (!result) return "/";
    // next.config sets trailingSlash: true, so every page URL ends in one.
    return result.endsWith("/") ? result : `${result}/`;
};

/** Absolute URL for a locale and optional sub-path, without a trailing slash. */
export const absoluteUrl = (locale: string, path = "") => {
    const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
    return `${BASE_URL}${localePrefix(locale)}${suffix}`;
};

/**
 * `alternates.languages` for Next's metadata.
 *
 * Only indexable locales are advertised. Telling Google that /az is an
 * Azerbaijani alternate of an English page whose body is largely English is
 * worse than not claiming the translation at all. English is "/" rather than
 * "/en" so the canonical and the hreflang agree; absolute URLs on purpose,
 * because Next resolves a bare "/" against metadataBase and drops the trailing
 * slash, which would publish the origin as "https://…" instead of "https://…/".
 */
export function languageAlternates(path = ""): Record<string, string> {
    const languages: Record<string, string> = {};
    for (const code of INDEXABLE_LOCALES) {
        languages[code] = `${BASE_URL}${localePath(code, path)}`;
    }

    const xDefault = isIndexableLocale(DEFAULT_LOCALE)
        ? DEFAULT_LOCALE
        : INDEXABLE_LOCALES[0];
    languages["x-default"] = `${BASE_URL}${localePath(xDefault, path)}`;
    return languages;
}

/**
 * Structured data for the site.
 *
 * WebApplication rather than the generic WebSite node: Google uses
 * applicationCategory, operatingSystem and offers to describe a tool in AI
 * Overviews and app-style rich results. `publisher` is pinned to the parent
 * organisation's @id so the invoice tool and fatahtech.com resolve as one
 * brand rather than two unrelated entities.
 */
export function buildJsonLd(locale: string) {
    const url = `${BASE_URL}${localePath(locale)}`;

    const organization = {
        "@type": "Organization",
        "@id": `${BRAND_URL}/#organization`,
        name: "FatahTech",
        url: BRAND_URL,
        logo: `${BASE_URL}/assets/favicon/android-chrome-512x512.png`,
    };

    return {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "@id": `${BASE_URL}/#app`,
        name: BRAND_NAME,
        alternateName: "Free Bulk & PDF Invoice Generator",
        url,
        description:
            "Free browser invoice generator with 15 professional templates, instant PDF printing and bulk invoice creation from CSV or Excel. Encrypted, local-first and no signup.",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Invoice Generator",
        operatingSystem: "Web Browser",
        browserRequirements: "Requires JavaScript. Requires HTML5.",
        isAccessibleForFree: true,
        inLanguage: locale,
        keywords: ROOTKEYWORDS,
        image: absoluteUrl(locale, "/opengraph-image"),
        featureList: [
            "15 professional invoice templates",
            "Custom fonts, accent colors, logos and signatures",
            "Single-invoice PDF printing",
            "Bulk invoice generation from CSV, XLS and XLSX",
            "Encrypted client-side storage",
            "JSON, CSV, XLSX, DOCX, XML and EN 16931 export",
        ],
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
        },
        publisher: organization,
        author: organization,
    };
}

/** FAQPage structured data, paired with the FAQ rendered on the page. */
export function buildFaqJsonLd(faqs: { q: string; a: string }[]) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
        })),
    };
}

/** Home → How it works, for the guide page. */
export function buildBreadcrumbJsonLd(locale: string) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: "Invoice Generator",
                item: `${BASE_URL}${localePath(locale)}`,
            },
            {
                "@type": "ListItem",
                position: 2,
                name: "How it works",
                item: `${BASE_URL}${localePath(locale, "/guide")}`,
            },
        ],
    };
}
