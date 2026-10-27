// Next Google Fonts
import {
    Alex_Brush,
    Dancing_Script,
    Great_Vibes,
    Inter,
    Parisienne,
} from "next/font/google";

// Interface font, matching fatahtech.com
export const inter = Inter({
    subsets: ["latin", "latin-ext"],
    display: "swap",
    variable: "--font-inter",
});

// Signature fonts
export const dancingScript = Dancing_Script({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-dancing-script",
    preload: true,
    display: "swap",
});

export const parisienne = Parisienne({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-parisienne",
    preload: true,
    display: "swap",
});

export const greatVibes = Great_Vibes({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-great-vibes",
    preload: true,
    display: "swap",
});

export const alexBrush = Alex_Brush({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-alex-brush",
    preload: true,
    display: "swap",
});
