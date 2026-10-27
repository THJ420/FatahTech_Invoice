import type { Metadata } from "next";

// Components
import LandingContent from "@/app/components/layout/LandingContent";

// i18n
import { getMessagesSafe } from "@/i18n/messages";

// SEO
import { languageAlternates, ROOTKEYWORDS } from "@/lib/seo";
import { BASE_URL, BRAND_NAME } from "@/lib/variables";

/**
 * The long-form copy, on its own page.
 *
 * It used to sit entirely below the builder, then only partly: the homepage
 * kept a heading, an intro and the FAQ while this page carried the rest. The
 * homepage is now just the tool, so the whole of it — including the FAQ and its
 * structured data — lives here, on a URL a crawler can index without the
 * builder competing with it for attention.
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
    const description = meta.description ?? "";

    // hreflang for this page's own path, not the homepage's.
    const languages = Object.fromEntries(
        Object.entries(languageAlternates()).map(([lang, path]) => [
            lang,
            `${path}/guide`,
        ])
    );

    return {
        metadataBase: new URL(BASE_URL),
        title,
        description,
        keywords: ROOTKEYWORDS,
        robots: { index: true, follow: true },
        alternates: { canonical: `/${locale}/guide`, languages },
        openGraph: {
            type: "article",
            siteName: BRAND_NAME,
            title,
            description,
            url: `/${locale}/guide`,
            locale,
        },
        twitter: { card: "summary_large_image", title, description },
    };
}

export default async function GuidePage(props: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await props.params;

    return (
        <main>
            <LandingContent locale={locale} />
        </main>
    );
}
