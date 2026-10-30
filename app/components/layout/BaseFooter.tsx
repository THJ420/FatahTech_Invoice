"use client";

import { useTranslationContext } from "@/contexts/TranslationContext";

// Next Intl
import { Link } from "@/i18n/navigation";

// Variables
import { BRAND_URL } from "@/lib/variables";

const BaseFooter = () => {
    const { _t } = useTranslationContext();
    const year = new Date().getFullYear();

    return (
        // pb clears the sticky MobileActionBar, which only renders below xl
        <footer className="border-t border-border">
            <div className="container flex flex-col items-center justify-between gap-3 py-6 pb-28 text-sm text-muted-foreground sm:flex-row xl:pb-6">
                <p>
                    © {year}{" "}
                    <a
                        href={BRAND_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                    >
                        FatahTech
                    </a>
                    . All rights reserved.
                </p>

                <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-6 sm:text-end">
                    {/*
                     * Attribution back to the parent site. The tools hub is the
                     * canonical index of FatahTech's browser utilities, and this
                     * is the one crawlable link between the invoice tool and it
                     * — kept visible in the footer rather than hidden anywhere.
                     */}
                    <p>
                        Powered by{" "}
                        <a
                            href={BRAND_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                        >
                            FatahTech
                        </a>{" "}
                        —{" "}
                        <a
                            href="https://fatahtech.com/tools/freebies"
                            target="_blank"
                            rel="noopener"
                            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                        >
                            Browse All Free Browser Tools
                        </a>
                    </p>

                    <nav className="shrink-0">
                        <Link
                            href="/guide"
                            className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                        >
                            {_t("footer.guide")}
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
};

export default BaseFooter;
