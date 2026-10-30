import { getMessagesSafe } from "@/i18n/messages";
import { buildFaqJsonLd } from "@/lib/seo";
import { Link } from "@/i18n/navigation";

import {
    ArrowRight,
    ChevronDown,
    FileSpreadsheet,
    LayoutTemplate,
    ShieldCheck,
} from "lucide-react";

type Point = { title: string; body: string };
type ContentSection = {
    heading: string;
    body: string;
    points: Record<string, Point>;
};
type Faq = { q: string; a: string };

type Landing = {
    h1: string;
    intro: string;
    home?: {
        eyebrow?: string;
        sections?: {
            templates?: ContentSection;
            bulk?: ContentSection;
            privacy?: ContentSection;
        };
        faqIntro?: string;
    };
    faqHeading?: string;
    faq?: Record<string, Faq>;
};

const SECTION_ICONS = {
    templates: LayoutTemplate,
    bulk: FileSpreadsheet,
    privacy: ShieldCheck,
} as const;

/**
 * The crawlable half of the homepage, below the builder.
 *
 * The tool above is a client-rendered app shell: a crawler sees form labels
 * and an empty preview, not what the product does. This section carries the
 * page's h1, the three keyword h2 sections, the privacy and bulk-export
 * explanations, and the FAQ — server-rendered, so all of it exists before
 * hydration.
 *
 * The h1 has to be visible: this is the page that ranks for "free invoice
 * generator", and a visually hidden heading gives a crawler the phrase but
 * gives a reader nothing. The builder's own section labels are h2s, so the
 * outline still has exactly one top-level heading.
 */
export default async function HomeContent({ locale }: { locale: string }) {
    const messages = await getMessagesSafe(locale);
    const landing = (messages as Record<string, unknown>)?.landing as
        | Landing
        | undefined;

    const home = landing?.home;
    const sections = home?.sections;
    const faqs = Object.values(landing?.faq ?? {});

    if (!sections || faqs.length === 0) return null;

    const ordered = [
        {
            id: "templates",
            key: "templates" as const,
            section: sections.templates,
        },
        { id: "bulk-export", key: "bulk" as const, section: sections.bulk },
        { id: "privacy", key: "privacy" as const, section: sections.privacy },
    ].filter(
        (
            entry
        ): entry is {
            id: string;
            key: keyof typeof SECTION_ICONS;
            section: ContentSection;
        } => Boolean(entry.section)
    );

    return (
        <section
            id="learn-more"
            aria-labelledby="learn-more-title"
            className="border-t border-border bg-card"
        >
            <div className="container py-16 md:py-24">
                <div className="mx-auto max-w-3xl">
                    <p className="inline-flex items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                        {home?.eyebrow}
                    </p>
                    <h1
                        id="learn-more-title"
                        className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {landing?.h1}
                    </h1>
                    <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                        {landing?.intro}
                    </p>
                    <Link
                        href="/guide"
                        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        Read the step-by-step guide
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="mx-auto mt-16 max-w-5xl space-y-16 md:mt-20 md:space-y-24">
                    {ordered.map(({ id, key, section }) => {
                        const Icon = SECTION_ICONS[key];
                        return (
                            <section key={id} id={id} className="scroll-mt-24">
                                <div className="flex items-start gap-4">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                                        {section.heading}
                                    </h2>
                                </div>
                                <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
                                    {section.body}
                                </p>

                                <div className="mt-8 grid gap-5 sm:grid-cols-3">
                                    {Object.values(section.points).map(
                                        (point) => (
                                            <div
                                                key={point.title}
                                                className="rounded-xl border border-border bg-background/60 p-5"
                                            >
                                                <h3 className="text-sm font-semibold">
                                                    {point.title}
                                                </h3>
                                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                                    {point.body}
                                                </p>
                                            </div>
                                        )
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>

                <div className="mx-auto mt-16 max-w-3xl md:mt-24">
                    <h2
                        id="faq"
                        className="scroll-mt-24 text-2xl font-semibold tracking-tight md:text-3xl"
                    >
                        {landing?.faqHeading}
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                        {home?.faqIntro}
                    </p>

                    <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/60 px-5">
                        {faqs.map((item) => (
                            <details key={item.q} className="group">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                                    <span>{item.q}</span>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                                </summary>
                                <p className="pb-5 pe-8 text-sm leading-relaxed text-muted-foreground">
                                    {item.a}
                                </p>
                            </details>
                        ))}
                    </div>
                </div>
            </div>

            {/*
             * FAQPage structured data built from the same array that renders
             * above, so the markup and the schema cannot disagree — Google's
             * requirement for FAQ rich results, and the reason this script
             * lives with the component rather than in the layout.
             */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(buildFaqJsonLd(faqs)),
                }}
            />
        </section>
    );
}
