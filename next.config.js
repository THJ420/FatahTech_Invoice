const withNextIntl = require("next-intl/plugin")("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
    /*
     * Trailing slashes on page routes.
     *
     * The homepage's canonical is the origin itself — https://invoice.fatahtech.com/
     * — and Next's metadata resolver rewrites a bare root URL to the origin
     * without the slash. Enabling trailing slashes keeps the canonical, the
     * hreflang URLs, the sitemap entries and the actual routes agreeing on one
     * form instead of canonicalising to a URL the site does not serve.
     */
    trailingSlash: true,
    webpack: (config) => {
        config.module.rules.push({
            test: /\.map$/,
            use: "ignore-loader",
        });
        return config;
    },
};

// Bundle analyzer
const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer(withNextIntl(nextConfig));
