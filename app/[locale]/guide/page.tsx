import type { Metadata } from "next";

// Components
import LandingContent from "@/app/components/layout/LandingContent";

// i18n
import { getMessagesSafe } from "@/i18n/messages";

// SEO
import {
    absoluteUrl,
    buildBreadcrumbJsonLd,
    isIndexableLocale,
    languageAlternates,
    localePath,
    ROOTKEYWORDS,
} from "@/lib/seo";
import { BASE_URL, BRAND_NAME } from "@/lib/variables";

/**
 * The long-form walkthrough, on its own page.
 *
 * The homepage carries the keyword sections and the FAQ; this page keeps the
 * feature overview and the step-by-step explanation, so the two URLs answer
 * different questions instead of competing with the same copy.
 */
export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;
    const messages = await getMessagesSafe(locale);
    const meta =
        (messages as Record<string, Record<string, string>>)?.meta ?? {};
    const landing =
        (messages as Record<string, Record<string, string>>)?.landing ?? {};

    const title = landing.guideH1 ?? landing.h1 ?? "How it works";
    const description = meta.guideDescription ?? meta.description ?? "";
    const image = absoluteUrl(locale, "/opengraph-image");
    const indexable = isIndexableLocale(locale);

    return {
        metadataBase: new URL(BASE_URL),
        title,
        description,
        keywords: ROOTKEYWORDS,
        // Partial translations render, but only complete locales are indexed.
        robots: indexable
            ? { index: true, follow: true }
            : { index: false, follow: true },
        alternates: {
            canonical: `${BASE_URL}${localePath(locale, "/guide")}`,
            ...(indexable ? { languages: languageAlternates("/guide") } : {}),
        },
        openGraph: {
            type: "article",
            siteName: BRAND_NAME,
            title,
            description,
            url: `${BASE_URL}${localePath(locale, "/guide")}`,
            locale,
            images: [
                {
                    url: image,
                    width: 1200,
                    height: 630,
                    alt: `${BRAND_NAME} — how the invoice generator works`,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [image],
        },
    };
}

export default async function GuidePage(props: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await props.params;

    return (
        <main>
            <LandingContent locale={locale} />

            {/* Home → How it works, matching the visible navigation. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(buildBreadcrumbJsonLd(locale)),
                }}
            />
        </main>
    );
}
