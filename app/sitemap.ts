import type { MetadataRoute } from "next";

import { INDEXABLE_LOCALES, languageAlternates, localePath } from "@/lib/seo";
import { BASE_URL, DEFAULT_LOCALE } from "@/lib/variables";

/**
 * One entry per indexable locale, each carrying the hreflang set for the other
 * indexable locales.
 *
 * Only locales with complete copy are listed. Every locale route still renders
 * — the language switcher depends on it — but a partly-English page should not
 * be submitted for indexing as a translation of the English one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();

    const entry = (path: string, priority: number, guide = false) => {
        const languages = languageAlternates(guide ? "/guide" : "");
        return {
            // English's path is "/", so its <loc> is the origin with a slash.
            url: `${BASE_URL}${path}`,
            lastModified,
            changeFrequency: "weekly" as const,
            priority,
            alternates: {
                // languageAlternates already returns absolute URLs.
                languages,
            },
        };
    };

    return INDEXABLE_LOCALES.flatMap((code) => [
        entry(localePath(code), code === DEFAULT_LOCALE ? 1 : 0.8),
        // The long-form walkthrough, its own indexable page.
        entry(
            localePath(code, "/guide"),
            code === DEFAULT_LOCALE ? 0.7 : 0.6,
            true
        ),
    ]);
}
