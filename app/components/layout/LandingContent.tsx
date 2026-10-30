import { getMessagesSafe } from "@/i18n/messages";

type Feature = { title: string; body: string };

/*
 * The lists are objects keyed "1", "2", "3" rather than arrays: next-intl's
 * AbstractIntlMessages does not permit arrays in a message file, so a JSON
 * array here fails to typecheck the moment the messages are loaded.
 */
type Landing = {
    h1: string;
    intro: string;
    /** The guide's own heading and lede, so it is not a copy of the homepage. */
    guideH1?: string;
    guideIntro?: string;
    featuresHeading: string;
    features: Record<string, Feature>;
    howHeading: string;
    how: Record<string, Feature>;
};

/**
 * The long-form copy, on the guide page.
 *
 * The homepage now carries the keyword sections and the FAQ (see
 * HomeContent); this page keeps the feature walkthrough and the step-by-step
 * explanation, so the two URLs answer different questions instead of competing
 * with the same FAQ. The help panel in the navbar reads `landing.faq`, the
 * same messages the homepage FAQ renders, so the two cannot drift.
 *
 * A server component on purpose — this is the half of the page that must exist
 * in the HTML rather than after hydration.
 */
export default async function LandingContent({ locale }: { locale: string }) {
    const messages = await getMessagesSafe(locale);
    const landing = (messages as Record<string, unknown>)?.landing as
        | Landing
        | undefined;

    if (!landing) return null;

    return (
        <section className="border-t border-border bg-card">
            <div className="container py-16 md:py-24">
                <div className="mx-auto max-w-3xl">
                    {/*
                     * The page's real h1. The builder's heading was demoted to
                     * a paragraph — see InvoiceForm — because an invoice
                     * template also renders headings inside the live preview,
                     * which meant the document had several competing h1s made
                     * of the user's own data.
                     */}
                    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                        {landing.guideH1 ?? landing.h1}
                    </h1>
                    <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                        {landing.guideIntro ?? landing.intro}
                    </p>
                </div>

                <div className="mx-auto mt-16 max-w-5xl">
                    <h2 className="text-xl font-semibold tracking-tight">
                        {landing.featuresHeading}
                    </h2>
                    <div className="mt-6 grid gap-8 md:grid-cols-3">
                        {Object.values(landing.features).map((feature) => (
                            <div key={feature.title}>
                                <h3 className="text-base font-semibold">
                                    {feature.title}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {feature.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mx-auto mt-16 max-w-5xl">
                    <h2 className="text-xl font-semibold tracking-tight">
                        {landing.howHeading}
                    </h2>
                    <ol className="mt-6 grid gap-8 md:grid-cols-3">
                        {Object.values(landing.how).map((step, index) => (
                            <li key={step.title}>
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                    {index + 1}
                                </span>
                                <h3 className="mt-3 text-base font-semibold">
                                    {step.title}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                    {step.body}
                                </p>
                            </li>
                        ))}
                    </ol>
                </div>

            </div>
        </section>
    );
}
