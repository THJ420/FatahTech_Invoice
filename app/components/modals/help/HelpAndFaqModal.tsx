"use client";

// Next Intl
import { useMessages } from "next-intl";

// ShadCn
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Icons
import { BookOpen, ChevronDown, HelpCircle, ShieldCheck } from "lucide-react";

/*
 * The two repeated lists are read from the message tree rather than through
 * `_t`, because their keys are objects keyed "1", "2", "3" — next-intl's
 * AbstractIntlMessages does not permit arrays, and a numeric path segment is
 * awkward to address. LandingContent reads `landing` the same way.
 */
type FaqEntry = { q: string; a: string };
type GuideStep = { title: string; body: string };

type HelpMessages = {
    landing?: {
        h1?: string;
        intro?: string;
        faq?: Record<string, FaqEntry>;
    };
    help?: {
        guide?: { steps?: Record<string, GuideStep> };
    };
};

type HelpAndFaqModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * The help surface behind the navbar button.
 *
 * Deliberately dark in both themes. The app itself follows the system theme, but
 * a panel that only ever appears over the builder reads better as one fixed
 * surface than as a second thing that changes colour — and it keeps the
 * illustrated header and the accent gradients legible in light mode too.
 *
 * Loaded on first open (see HelpAndFaqButton), so the copy here costs the
 * builder's initial bundle nothing.
 */
const HelpAndFaqModal = ({ open, onOpenChange }: HelpAndFaqModalProps) => {
    const { _t } = useTranslationContext();
    const messages = useMessages() as HelpMessages;

    const faqs = Object.values(messages.landing?.faq ?? {});
    const steps = Object.values(messages.help?.guide?.steps ?? {});

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                // The default scrim is the app background; this one has to be
                // dark in light mode too, since the panel itself always is.
                overlayClassName="bg-slate-950/80"
                className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#070d19] p-0 text-slate-200 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)]"
            >
                {/* Header */}
                <div className="relative shrink-0 overflow-hidden border-b border-white/10 px-6 pb-5 pt-6 sm:px-8">
                    {/*
                     * Two very low-opacity radials, the same trick the dark
                     * page background uses — they give the panel a light
                     * source without an image asset.
                     */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/25 blur-3xl"
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl"
                    />

                    <div className="relative flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-400 text-white shadow-lg shadow-primary/30">
                            <HelpCircle className="h-5 w-5" />
                        </span>

                        {/* `pe-8` keeps the title clear of the dialog's close button. */}
                        <div className="min-w-0 pe-8">
                            <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                                {_t("help.title")}
                            </DialogTitle>
                            <DialogDescription className="mt-1 text-sm text-slate-400">
                                {_t("help.subtitle")}
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <Tabs
                    defaultValue="about"
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="shrink-0 px-6 pt-4 sm:px-8">
                        <TabsList className="h-9 justify-start rounded-lg bg-white/5 p-1">
                            <TabsTrigger
                                value="about"
                                className="gap-1.5 rounded-md px-3 text-sm text-slate-400 hover:text-slate-200 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"
                            >
                                <HelpCircle className="h-4 w-4" />
                                {_t("help.tabs.about")}
                            </TabsTrigger>
                            <TabsTrigger
                                value="guide"
                                className="gap-1.5 rounded-md px-3 text-sm text-slate-400 hover:text-slate-200 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"
                            >
                                <BookOpen className="h-4 w-4" />
                                {_t("help.tabs.guide")}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* About & FAQs */}
                    <TabsContent
                        value="about"
                        className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8"
                    >
                        <div className="space-y-6">
                            <section>
                                <h3 className="text-xl font-semibold tracking-tight text-white">
                                    {messages.landing?.h1}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                    {messages.landing?.intro}
                                </p>
                            </section>

                            <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                                <div>
                                    <p className="text-sm font-medium text-emerald-100">
                                        {_t("help.about.privacyHeading")}
                                    </p>
                                    <p className="mt-1 text-sm leading-relaxed text-emerald-100/60">
                                        {_t("help.about.privacyBody")}
                                    </p>
                                </div>
                            </div>

                            <section>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    {_t("help.about.faqHeading")}
                                </h4>

                                {/*
                                 * Native <details> rather than an accordion
                                 * primitive: it is keyboard accessible and
                                 * open/close costs no JavaScript, which keeps
                                 * this panel light enough to load on first
                                 * click.
                                 */}
                                <div className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] px-4">
                                    {faqs.map((item) => (
                                        <details
                                            key={item.q}
                                            className="group last:border-b-0"
                                        >
                                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-sm font-medium text-slate-100 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                                                <span>{item.q}</span>
                                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180" />
                                            </summary>
                                            <p className="pb-4 pe-8 text-sm leading-relaxed text-slate-400">
                                                {item.a}
                                            </p>
                                        </details>
                                    ))}
                                </div>
                            </section>

                            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                                <p className="text-sm font-medium text-slate-100">
                                    {_t("help.about.stillStuck")}
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                                    {_t("help.about.stillStuckBody")}
                                </p>
                            </div>
                        </div>
                    </TabsContent>

                    {/* User guide */}
                    <TabsContent
                        value="guide"
                        className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8"
                    >
                        <div className="space-y-5">
                            <section>
                                <h3 className="text-xl font-semibold tracking-tight text-white">
                                    {_t("help.guide.heading")}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                                    {_t("help.guide.intro")}
                                </p>
                            </section>

                            <ol className="space-y-3">
                                {steps.map((step, index) => (
                                    <li
                                        key={step.title}
                                        className="flex gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.05]"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary ring-1 ring-inset ring-white/10">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-semibold text-slate-100">
                                                {step.title}
                                            </h4>
                                            <p className="mt-1 text-sm leading-relaxed text-slate-400">
                                                {step.body}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default HelpAndFaqModal;
