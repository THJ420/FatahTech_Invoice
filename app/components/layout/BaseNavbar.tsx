"use client";

import { useMemo, useState } from "react";

// Next
import Link from "next/link";
import Image from "next/image";

// Assets
import LogoDark from "@/public/assets/logo_dark_no_txt.webp";
import LogoLight from "@/public/assets/logo_light_fav.webp";

// ShadCn
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

// Components
import {
    BaseButton,
    DevDebug,
    GitHubLink,
    HelpAndFaqButton,
    LanguageSelector,
    ThemeSwitcher,
} from "@/app/components";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { Settings2 } from "lucide-react";

const BaseNavbar = () => {
    const devEnv = useMemo(() => {
        return process.env.NODE_ENV === "development";
    }, []);

    const [menuOpen, setMenuOpen] = useState(false);

    const { _t } = useTranslationContext();

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <nav className="container flex h-16 items-center justify-between gap-4">
                <Link
                    href="/"
                    className="flex shrink-0 items-center gap-2"
                    aria-label="FatahTech Invoice"
                >
                    {/*
                     * The mark is navy on light surfaces and white on the dark
                     * one, so each theme gets its own file. Both are decorative
                     * — the wordmark beside them carries the accessible name.
                     */}
                    <span className="flex w-9 shrink-0 items-center justify-center sm:w-10">
                        <Image
                            src={LogoDark}
                            alt=""
                            width={2280}
                            height={2145}
                            loading="eager"
                            priority
                            className="h-8 w-auto dark:hidden sm:h-9"
                        />
                        <Image
                            src={LogoLight}
                            alt=""
                            width={1253}
                            height={1639}
                            loading="eager"
                            priority
                            className="hidden h-8 w-auto dark:block sm:h-9"
                        />
                    </span>
                    <span className="text-base font-semibold tracking-tight sm:text-lg">
                        FatahTech{" "}
                        <span className="brand-gradient">Invoice</span>
                    </span>
                </Link>

                {/* ? DEV Only */}
                {devEnv && (
                    <div className="hidden lg:block">
                        <DevDebug />
                    </div>
                )}

                {/* Desktop controls */}
                <div className="hidden items-center gap-2 sm:flex">
                    <LanguageSelector />
                    {/*
                     * Source link, help and theme, in that order: reference
                     * first, then the two things reached for when something is
                     * unclear — "make it lighter" and "what does this do" —
                     * sitting together in the corner of every page.
                     */}
                    <GitHubLink />
                    <HelpAndFaqButton />
                    <ThemeSwitcher />
                </div>

                {/*
                 * Below sm the language select alone is wider than the space
                 * left beside the logo, so both controls move into a sheet.
                 *
                 * The GitHub link moves with them: a fourth icon would push the
                 * control cluster past the 343px a 375px phone leaves after the
                 * container's gutters, and the wordmark has nowhere to go.
                 */}
                <div className="flex items-center gap-1 sm:hidden">
                    <HelpAndFaqButton />
                    <ThemeSwitcher />
                    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                        <SheetTrigger asChild>
                            <BaseButton
                                variant="ghost"
                                size="icon"
                                aria-label={_t("navbar.openSettings")}
                            >
                                <Settings2 className="h-5 w-5" />
                            </BaseButton>
                        </SheetTrigger>
                        <SheetContent
                            side="right"
                            className="w-[85vw] max-w-sm"
                        >
                            <SheetHeader className="mb-6">
                                <SheetTitle>{_t("navbar.settings")}</SheetTitle>
                            </SheetHeader>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <span className="text-sm text-muted-foreground">
                                        {_t("navbar.language")}
                                    </span>
                                    <LanguageSelector variant="block" />
                                </div>

                                <GitHubLink variant="block" />

                                {devEnv && <DevDebug />}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </nav>
        </header>
    );
};

export default BaseNavbar;
