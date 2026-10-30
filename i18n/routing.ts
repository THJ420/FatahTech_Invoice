import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/variables";

export const routing = defineRouting({
    locales: LOCALES.map(({ code }) => code),
    defaultLocale: DEFAULT_LOCALE,
    /*
     * English is served from "/" rather than "/en".
     *
     * The homepage is the page that ranks for "free invoice generator", so its
     * canonical has to be the origin itself — https://invoice.fatahtech.com/.
     * With localePrefix "always", "/" only ever 307s to "/en", so canonicalising
     * "/en" to "/" would point at a redirect. "as-needed" makes "/" the real
     * English document; /en and every other prefixed path redirect to it, and
     * the remaining locales stay at /az, /de, …
     */
    localePrefix: "as-needed",
});
