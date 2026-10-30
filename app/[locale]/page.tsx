// Components
import { InvoiceMain } from "@/app/components";
import HomeContent from "@/app/components/layout/HomeContent";

// Contexts
import { WizardProvider } from "@/contexts/WizardContext";

export default async function Home(props: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await props.params;

    return (
        <main>
            {/* `pb-28 xl:pb-10` clears the sticky MobileActionBar, which only
                renders below xl. */}
            {/*
             * `shell:` strips the container so the two panes reach the window
             * edges, as in the mockup. Below it the builder stays a normal
             * page-width block.
             */}
            <div
                id="invoice-builder"
                className="container py-6 pb-28 md:py-10 xl:pb-10 shell:max-w-none shell:px-0 shell:py-0 shell:pb-0"
            >
                {/*
                 * No Suspense boundary: WizardProvider reads the step from
                 * window.location rather than useSearchParams, so this page
                 * stays statically prerendered. See contexts/WizardContext.tsx
                 */}
                <WizardProvider>
                    <InvoiceMain />
                </WizardProvider>
            </div>

            {/*
             * The page's only h1, the three keyword sections and the FAQ — all
             * server-rendered below the tool so the homepage can rank for the
             * phrases the builder itself cannot say.
             */}
            <HomeContent locale={locale} />
        </main>
    );
}
