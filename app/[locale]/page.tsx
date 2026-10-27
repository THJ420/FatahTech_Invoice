// Components
import { InvoiceMain } from "@/app/components";

// Contexts
import { WizardProvider } from "@/contexts/WizardContext";

// i18n
import { getMessagesSafe } from "@/i18n/messages";

export default async function Home(props: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await props.params;

    const messages = await getMessagesSafe(locale);
    const landing = (messages as Record<string, unknown>)?.landing as
        | { h1?: string }
        | undefined;

    return (
        <>
            {/* `pb-28 xl:pb-10` clears the sticky MobileActionBar, which only
                renders below xl. */}
            {/*
             * `shell:` strips the container so the two panes reach the window
             * edges, as in the mockup. Below it the builder stays a normal
             * page-width block.
             */}
            <main className="container py-6 pb-28 md:py-10 xl:pb-10 shell:max-w-none shell:px-0 shell:py-0 shell:pb-0">
                {/*
                 * The page's only h1, visually hidden.
                 *
                 * The prose that used to sit below the builder carried the
                 * heading, and it now lives on /guide — but a document with no
                 * h1 is worse for screen-reader navigation and for a crawler,
                 * and the builder cannot supply one: every invoice template
                 * renders headings inside the live preview, made of the user's
                 * own data. A descriptive heading that is present in the markup
                 * and out of the way is the honest answer.
                 */}
                <h1 className="sr-only">{landing?.h1 ?? "Free invoice generator"}</h1>

                {/*
                 * No Suspense boundary: WizardProvider reads the step from
                 * window.location rather than useSearchParams, so this page
                 * stays statically prerendered. See contexts/WizardContext.tsx
                 */}
                <WizardProvider>
                    <InvoiceMain />
                </WizardProvider>
            </main>
        </>
    );
}
