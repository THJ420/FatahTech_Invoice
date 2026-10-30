// Components
import { BaseFooter, BaseNavbar } from "@/app/components";
// ShadCn
import { Toaster } from "@/components/ui/toaster";
// Contexts
import Providers from "@/contexts/Providers";
// Fonts
import {
    alexBrush,
    dancingScript,
    greatVibes,
    inter,
    parisienne,
} from "@/lib/fonts";
/*
 * Invoice document fonts.
 *
 * The templates name these families explicitly (see invoiceTheme.ts), and the
 * print view copies the app's stylesheets, so importing them here is what makes
 * the live preview, the printed page and the archived PDF agree. Fontsource
 * ships @font-face rules with unicode-range, so a browser only downloads the
 * slices the invoice actually uses.
 *
 * Noto Sans SC is the CJK fallback and is variable/subsetted the same way; the
 * Hebrew and Arabic faces cover the right-to-left locales, which none of the
 * Latin families contain glyphs for.
 */
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/500.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/noto-sans-hebrew/400.css";
import "@fontsource/noto-sans-hebrew/700.css";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@fontsource-variable/noto-sans-sc";
// SEO
import {
    absoluteUrl,
    buildJsonLd,
    languageAlternates,
    localePath,
    ROOTKEYWORDS,
} from "@/lib/seo";
// Variables
import {
    BASE_URL,
    BRAND_NAME,
    BRAND_URL,
    dirForLocale,
    GOOGLE_SC_VERIFICATION,
    LOCALES,
} from "@/lib/variables";
// Vercel Analytics
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
// Next Intl
import { NextIntlClientProvider } from "next-intl";
import { getMessagesSafe } from "@/i18n/messages";

/**
 * Per-locale metadata.
 *
 * This was a single static object: one English title and description served to
 * all eighteen locales, no metadataBase, no Open Graph, no Twitter card, no
 * hreflang, and `canonical` hardcoded to the bare origin — which, since every
 * locale is path-prefixed, is a redirect rather than a page. Each locale was
 * telling search engines that the canonical version of itself was somewhere
 * else.
 */
export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;

    /*
     * Requests such as /_vercel/insights/script.js are excluded from the i18n
     * middleware and can fall through to the [locale] routes. Reject them as
     * 404s before trying to import a locale file that cannot exist.
     */
    if (!LOCALES.some((entry) => entry.code === locale)) notFound();

    const messages = await getMessagesSafe(locale);
    const meta =
        (messages as Record<string, Record<string, string>>)?.meta ?? {};

    const title =
        meta.title ??
        `Free Bulk & PDF Invoice Generator — No Signup, 100% Local | ${BRAND_NAME}`;
    const description =
        meta.description ??
        "Create invoices from 15 professional templates, export instant PDFs, and bulk-generate from CSV or Excel. Encrypted local storage, 100% free — no signup.";

    const image = absoluteUrl(locale, "/opengraph-image");

    return {
        // Base for generated social images and any relative URL below. The
        // canonical itself is absolute so English's remains the origin with
        // its trailing slash — https://invoice.fatahtech.com/.
        metadataBase: new URL(BASE_URL),
        applicationName: BRAND_NAME,
        title,
        description,
        keywords: ROOTKEYWORDS,
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                "max-image-preview": "large",
                "max-snippet": -1,
                "max-video-preview": -1,
            },
        },
        alternates: {
            // Absolute so the default locale's canonical keeps its final "/":
            // the requested canonical is https://invoice.fatahtech.com/.
            canonical: `${BASE_URL}${localePath(locale)}`,
            languages: languageAlternates(),
        },
        openGraph: {
            type: "website",
            siteName: BRAND_NAME,
            title,
            description,
            url: `${BASE_URL}${localePath(locale)}`,
            locale,
            images: [
                {
                    url: image,
                    width: 1200,
                    height: 630,
                    alt: `${BRAND_NAME} — free bulk and PDF invoice generator`,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
        authors: {
            name: BRAND_NAME,
            url: BRAND_URL,
        },
        creator: "FatahTech",
        publisher: "FatahTech",
        verification: {
            google: GOOGLE_SC_VERIFICATION,
        },
    };
}

export const viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#020817" },
    ],
};

export function generateStaticParams() {
    // Next.js expects an array of objects: [{ locale: 'en' },
    // ...]
    const locales = LOCALES.map((locale) => ({ locale: locale.code }));
    return locales;
}

export default async function LocaleLayout(props: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const params = await props.params;

    const { locale } = params;

    const { children } = props;

    // Keep non-locale paths (e.g. /_vercel/*) from reaching message loading.
    if (!LOCALES.some((entry) => entry.code === locale)) notFound();

    // English-backed, and falls back to English if this locale's file cannot
    // be loaded, so a bad translation file cannot take the route down.
    const messages = await getMessagesSafe(locale);

    return (
        /*
         * `dir` was missing entirely. Arabic has been in LOCALES since before
         * this branch and rendered right-to-left text inside a left-to-right
         * document the whole time.
         */
        <html lang={locale} dir={dirForLocale(locale)} suppressHydrationWarning>
            <head suppressHydrationWarning>
                <script
                    type="application/ld+json"
                    id="json-ld"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(buildJsonLd(locale)),
                    }}
                />
            </head>
            <body
                className={`${inter.variable} ${inter.className} ${dancingScript.variable} ${parisienne.variable} ${greatVibes.variable} ${alexBrush.variable} antialiased min-h-dvh bg-background text-foreground`}
                suppressHydrationWarning
            >
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <Providers>
                        <BaseNavbar />

                        <div className="flex flex-col">{children}</div>

                        <BaseFooter />

                        {/* Toast component */}
                        <Toaster />

                        {/* Vercel analytics */}
                        <Analytics />
                    </Providers>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
