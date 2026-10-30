import type { MetadataRoute } from "next";

import { languageAlternates, localePath } from "@/lib/seo";
import { BASE_URL, LOCALES } from "@/lib/variables";

/**
 * One entry per locale, each carrying the full hreflang set.
 *
 * There was no sitemap at all, and `app/robots.txt` had no `Sitemap:` line to
 * point at one, so the eighteen locale pages had to be discovered by crawling.
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

    return LOCALES.flatMap(({ code }) => [
        entry(localePath(code), code === "en" ? 1 : 0.8),
        // The long-form copy, its own indexable page.
        entry(localePath(code, "/guide"), code === "en" ? 0.7 : 0.6, true),
    ]);
}
