"use client";

import { useTheme } from "next-themes";

// Components
import { BaseButton } from "@/app/components";

// Icons
import { Moon, Sun } from "lucide-react";

/**
 * Light / dark toggle.
 *
 * Reads `resolvedTheme` rather than `theme`: with the system option switched
 * off the two agree, but `resolvedTheme` is the value that matches the class
 * actually on `<html>`, so the button can never set the mode that is already
 * showing. `next-themes` persists the choice to localStorage itself.
 */
const ThemeSwitcher = () => {
    const { resolvedTheme, setTheme } = useTheme();

    return (
        <BaseButton
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            className="relative"
            onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
        >
            {/*
             * Both icons are always in the DOM and CSS picks one, so the right
             * glyph is on screen from the first paint — before hydration has
             * told React which theme is active.
             */}
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </BaseButton>
    );
};

export default ThemeSwitcher;
