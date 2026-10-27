import type { MetadataRoute } from "next";

import { BRAND_NAME, BRAND_SHORT } from "@/lib/variables";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: BRAND_NAME,
        short_name: BRAND_SHORT,
        description:
            "Create, print and bulk-export invoices entirely in your browser.",
        start_url: "/",
        display: "standalone",
        background_color: "#020817",
        theme_color: "#020817",
        icons: [
            {
                src: "/assets/favicon/android-chrome-192x192.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/assets/favicon/android-chrome-512x512.png",
                sizes: "512x512",
                type: "image/png",
            },
            {
                src: "/assets/favicon/apple-touch-icon.png",
                sizes: "180x180",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
