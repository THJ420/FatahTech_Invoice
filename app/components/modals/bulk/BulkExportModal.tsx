"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ComponentProps,
} from "react";

// RHF
import { useFormContext } from "react-hook-form";

// Next Intl
import { useLocale, useMessages } from "next-intl";

// ShadCn
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Components
import { BaseButton } from "@/app/components";
import BulkInvoicePreview from "./BulkInvoicePreview";

// Templates
import { TEMPLATES } from "@/app/components/templates/invoice-pdf/registry";
import {
    ACCENT_PRESETS,
    INVOICE_FONTS,
    type InvoiceDensity,
    type InvoiceFontId,
} from "@/app/components/templates/invoice-pdf/invoiceTheme";
import { buildInvoiceLabels } from "@/app/components/templates/invoice-pdf/invoiceLabels";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Services
import { renderInvoicePdf } from "@/services/invoice/client/bulkPdf";

// Helpers
import { downloadBlob } from "@/lib/download";
import { cn } from "@/lib/utils";
import {
    BULK_FIELDS,
    BULK_REQUIRED_FIELDS,
    autoMapHeaders,
    buildBulkInvoices,
    parseSpreadsheet,
    type BulkField,
    type BulkIssue,
    type BulkStyle,
    type HeaderMapping,
    type SpreadsheetData,
} from "@/lib/bulkExport";

// Types
import type { InvoiceType } from "@/types";

// Icons
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    Download,
    FileArchive,
    FileSpreadsheet,
    Info,
    Loader2,
    Palette,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    Table2,
    UploadCloud,
    type LucideIcon,
} from "lucide-react";

const STEPS = ["upload", "map", "style", "preview"] as const;
const NOT_MAPPED = "__none";
const DENSITIES: InvoiceDensity[] = ["compact", "comfortable", "spacious"];

type BulkExportModalProps = {
    /** Optional trigger. Omit it to drive the dialog from a parent. */
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

type ProgressState = {
    current: number;
    total: number;
    running: boolean;
    packaging: boolean;
};

type ResultState = {
    done: number;
    failed: string[];
};

const cloneInvoice = <T,>(value: T): T => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

const stepIndex = (step: (typeof STEPS)[number]) => STEPS.indexOf(step);

const formatCell = (value: unknown): string => {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return "—";

        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    const text = value === null || value === undefined ? "" : String(value);
    return text.trim() || "—";
};

/**
 * The mapping dropdowns.
 *
 * Wraps `SelectContent` only to pin the side offset, the collision padding and
 * a scrollable viewport; the colours come from the popover tokens, so the menu
 * matches whichever theme is active.
 */
function SelectMenuContent({
    className,
    ...props
}: ComponentProps<typeof SelectContent>) {
    return (
        <SelectContent
            {...props}
            sideOffset={6}
            collisionPadding={12}
            viewportClassName="h-auto max-h-72 overflow-y-auto"
            className={cn(
                "border-border bg-popover text-popover-foreground shadow-2xl",
                className
            )}
        />
    );
}

function StepHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {title}
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {description}
                </p>
            </div>
        </div>
    );
}

function MappingSelect({
    field,
    value,
    headers,
    onChange,
}: {
    field: BulkField;
    value?: string;
    headers: string[];
    onChange: (header: string | undefined) => void;
}) {
    const { _t } = useTranslationContext();
    const missing = Boolean(field.required && !value);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <Label
                    htmlFor={`bulk-map-${field.key}`}
                    className="text-xs font-medium text-foreground/80"
                >
                    {_t(`bulkExport.fields.${field.key}`)}
                </Label>
                {field.required && (
                    <span
                        className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                            missing
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-muted text-muted-foreground"
                        )}
                    >
                        {_t("bulkExport.map.required")}
                    </span>
                )}
            </div>

            <Select
                value={value ?? NOT_MAPPED}
                onValueChange={(next) =>
                    onChange(next === NOT_MAPPED ? undefined : next)
                }
            >
                <SelectTrigger
                    id={`bulk-map-${field.key}`}
                    className={cn(
                        "h-10 w-full border-border bg-muted/60 text-sm text-foreground hover:border-primary/50 focus:ring-ring/40",
                        missing && "border-amber-500/60"
                    )}
                >
                    <SelectValue placeholder={_t("bulkExport.map.notMapped")} />
                </SelectTrigger>
                <SelectMenuContent>
                    <SelectItem value={NOT_MAPPED}>
                        {_t("bulkExport.map.notMapped")}
                    </SelectItem>
                    {headers.map((header) => (
                        <SelectItem
                            key={header}
                            value={header}
                            className="focus:bg-muted focus:text-foreground"
                        >
                            {header}
                        </SelectItem>
                    ))}
                </SelectMenuContent>
            </Select>
        </div>
    );
}

function IssueList({
    issues,
    heading,
}: {
    issues: BulkIssue[];
    heading: string;
}) {
    const shown = issues.slice(0, 6);
    const hasError = issues.some((issue) => issue.severity === "error");

    return (
        <div
            className={cn(
                "rounded-xl border p-3",
                hasError
                    ? "border-rose-500/25 bg-rose-500/5"
                    : "border-amber-500/25 bg-amber-500/5"
            )}
        >
            <p
                className={cn(
                    "flex items-center gap-2 text-xs font-semibold",
                    hasError
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-amber-700 dark:text-amber-300"
                )}
            >
                <AlertTriangle className="h-3.5 w-3.5" />
                {heading}
            </p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                {shown.map((issue, index) => (
                    <li key={`${issue.row}-${index}`}>
                        Row {issue.row}: {issue.message}
                    </li>
                ))}
                {issues.length > shown.length && (
                    <li>+{issues.length - shown.length} more</li>
                )}
            </ul>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                {value}
            </p>
        </div>
    );
}

function formatBatchTotal(invoices: InvoiceType[], locale: string) {
    const currency = invoices[0]?.details.currency || "USD";
    const total = invoices.reduce(
        (sum, invoice) => sum + invoice.details.totalAmount,
        0
    );

    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
        }).format(total);
    } catch {
        return `${total.toFixed(2)} ${currency}`;
    }
}

const BulkExportModal = ({
    children,
    open: controlledOpen,
    onOpenChange: onControlledOpenChange,
}: BulkExportModalProps) => {
    const { getValues } = useFormContext<InvoiceType>();
    const messages = useMessages();
    const locale = useLocale();
    const { _t } = useTranslationContext();

    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const [step, setStep] = useState<(typeof STEPS)[number]>("upload");
    const [sheet, setSheet] = useState<SpreadsheetData | null>(null);
    const [mapping, setMapping] = useState<HeaderMapping>({});
    const [baseInvoice, setBaseInvoice] = useState<InvoiceType | null>(null);
    const [style, setStyle] = useState<BulkStyle>({
        templateId: 1,
        fontId: "outfit",
        density: "comfortable",
        accentColor: "#2563EB",
    });
    const [optionalExpanded, setOptionalExpanded] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [zipError, setZipError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ProgressState>({
        current: 0,
        total: 0,
        running: false,
        packaging: false,
    });
    const [result, setResult] = useState<ResultState | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const optionalFieldsRef = useRef<HTMLDivElement>(null);

    const labels = useMemo(
        () => buildInvoiceLabels(messages as Record<string, unknown>),
        [messages]
    );

    const initialize = useCallback(() => {
        const snapshot = cloneInvoice(getValues());
        const theme = snapshot.details.theme;

        setBaseInvoice(snapshot);
        setStyle({
            templateId: snapshot.details.pdfTemplate ?? 1,
            fontId: theme?.fontId ?? "outfit",
            density: theme?.density ?? "comfortable",
            accentColor: theme?.accentColor ?? "#2563EB",
        });
        setStep("upload");
        setSheet(null);
        setMapping({});
        setOptionalExpanded(false);
        setFileError(null);
        setZipError(null);
        setResult(null);
        setProgress({
            current: 0,
            total: 0,
            running: false,
            packaging: false,
        });
    }, [getValues]);

    /*
     * A controlled parent flips `open` directly, so Radix's onOpenChange never
     * sees the opening transition. Initialise here instead, once per open.
     */
    const wasOpen = useRef(false);
    useEffect(() => {
        if (open && !wasOpen.current) initialize();
        wasOpen.current = open;
    }, [open, initialize]);

    const handleOpenChange = useCallback(
        (next: boolean) => {
            if (progress.running) return;

            if (controlledOpen === undefined) setInternalOpen(next);
            onControlledOpenChange?.(next);
        },
        [controlledOpen, onControlledOpenChange, progress.running]
    );

    const built = useMemo(() => {
        if (!sheet || !baseInvoice) {
            return { invoices: [] as InvoiceType[], issues: [] as BulkIssue[] };
        }

        return buildBulkInvoices({
            rows: sheet.rows,
            mapping,
            style,
            base: baseInvoice,
        });
    }, [sheet, mapping, style, baseInvoice]);

    const missingRequired = useMemo(
        () => BULK_REQUIRED_FIELDS.filter((key) => !mapping[key]),
        [mapping]
    );

    const issues = built.issues.filter((issue) => issue.severity === "error");
    const warnings = built.issues.filter(
        (issue) => issue.severity === "warning"
    );

    const requiredFields = BULK_FIELDS.filter((field) => field.required);
    const optionalFields = BULK_FIELDS.filter((field) => !field.required);
    const optionalMapped = optionalFields.filter(
        (field) => mapping[field.key]
    ).length;

    const totalItems = useMemo(
        () =>
            built.invoices.reduce(
                (sum, invoice) => sum + invoice.details.items.length,
                0
            ),
        [built.invoices]
    );

    const selectedTemplate =
        TEMPLATES.find((template) => template.id === style.templateId) ??
        TEMPLATES[0];

    const toggleOptionalFields = () => {
        const next = !optionalExpanded;
        setOptionalExpanded(next);

        /*
         * The optional grid sits below the required fields, so expanding it in
         * place would leave the new controls off-screen. Bring the card to the
         * top of the scroll area so the expansion is visible.
         */
        if (next) {
            requestAnimationFrame(() => {
                optionalFieldsRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            });
        }
    };

    const parseFile = async (file: File) => {
        setFileError(null);
        setZipError(null);
        setResult(null);

        if (!/\.(csv|xls|xlsx)$/i.test(file.name)) {
            setFileError(_t("bulkExport.errors.fileType"));
            return;
        }

        setParsing(true);

        try {
            const data = await parseSpreadsheet(file);
            setSheet(data);
            setMapping(autoMapHeaders(data.headers));
            setStep("map");
        } catch (error) {
            setSheet(null);
            setMapping({});
            setFileError(
                error instanceof Error
                    ? error.message
                    : _t("bulkExport.errors.fileType")
            );
        } finally {
            setParsing(false);
        }
    };

    const handleFileInput = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (file) await parseFile(file);
        event.target.value = "";
    };

    const handleDrop = async (event: React.DragEvent) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) await parseFile(file);
    };

    const canEnter = (target: (typeof STEPS)[number]) => {
        if (progress.running) return false;

        const index = stepIndex(target);

        if (index === 0) return true;
        if (index === 1) return Boolean(sheet);
        if (index === 2) {
            return Boolean(sheet) && missingRequired.length === 0;
        }
        return Boolean(sheet) && missingRequired.length === 0;
    };

    const goTo = (target: (typeof STEPS)[number]) => {
        if (canEnter(target)) setStep(target);
    };

    const next = () => {
        const index = stepIndex(step);
        const target = STEPS[Math.min(STEPS.length - 1, index + 1)];
        if (canEnter(target)) setStep(target);
    };

    const back = () => {
        const index = stepIndex(step);
        if (index > 0) setStep(STEPS[index - 1]);
    };

    const startExport = async () => {
        if (progress.running || !baseInvoice || built.invoices.length === 0) {
            return;
        }

        setZipError(null);
        setResult(null);
        setProgress({
            current: 0,
            total: built.invoices.length,
            running: true,
            packaging: false,
        });

        const failed: string[] = [];

        try {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            const used = new Set<string>();

            for (let index = 0; index < built.invoices.length; index += 1) {
                const invoice = built.invoices[index];

                setProgress({
                    current: index,
                    total: built.invoices.length,
                    running: true,
                    packaging: false,
                });

                try {
                    const pdf = await renderInvoicePdf({
                        data: invoice,
                        labels,
                        locale,
                        index,
                    });

                    let name = pdf.fileName;
                    let copy = 2;
                    while (used.has(name)) {
                        name = pdf.fileName.replace(/\.pdf$/i, `-${copy}.pdf`);
                        copy += 1;
                    }

                    used.add(name);
                    zip.file(name, pdf.bytes);
                } catch (error) {
                    console.error(
                        `Bulk export failed for ${invoice.details.invoiceNumber}`,
                        error
                    );
                    failed.push(invoice.details.invoiceNumber);
                }
            }

            if (used.size === 0) {
                setZipError(_t("bulkExport.errors.allFailed"));
                return;
            }

            setProgress((previous) => ({
                ...previous,
                current: previous.total,
                packaging: true,
            }));

            const blob = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 },
            });

            downloadBlob(blob, "invoices_bulk_export.zip");
            setResult({ done: used.size, failed });
        } catch (error) {
            console.error("Bulk ZIP export failed", error);
            setZipError(_t("bulkExport.errors.renderFailed"));
        } finally {
            setProgress((previous) => ({
                ...previous,
                running: false,
                packaging: false,
            }));
        }
    };

    const reset = () => {
        if (progress.running) return;
        setStep("upload");
        setSheet(null);
        setMapping({});
        setOptionalExpanded(false);
        setFileError(null);
        setZipError(null);
        setResult(null);
        setProgress({
            current: 0,
            total: 0,
            running: false,
            packaging: false,
        });
    };

    const currentIndex = stepIndex(step);
    const currentStepLabel = _t(`bulkExport.steps.${step}`);

    const progressValue = result
        ? 100
        : progress.total > 0
          ? Math.round((progress.current / progress.total) * 100)
          : 0;

    const progressLabel = progress.packaging
        ? _t("bulkExport.export.packaging", { count: progress.total })
        : _t("bulkExport.export.progress", {
              current: Math.min(progress.current + 1, progress.total),
              total: progress.total,
          });

    const resultText = result
        ? result.failed.length > 0
            ? _t("bulkExport.export.partial", {
                  done: result.done,
                  total: built.invoices.length,
                  failed: result.failed.join(", "),
              })
            : _t("bulkExport.export.complete", { count: result.done })
        : null;

    const canContinue =
        step === "upload"
            ? Boolean(sheet)
            : step === "map"
              ? missingRequired.length === 0 && built.invoices.length > 0
              : step === "style"
                ? built.invoices.length > 0
                : false;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}

            {/*
             * No `dark` class and no forced dark scrim: this used to be a dark
             * panel inside a `dark` subtree, which meant the bulk exporter
             * stayed dark in a light session. Everything below is built from
             * theme tokens now, so the modal follows the app's mode.
             */}
            <DialogContent
                className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl [&>button]:text-muted-foreground [&>button]:hover:text-foreground sm:max-h-[92dvh] sm:w-[calc(100vw-3rem)] sm:rounded-2xl md:w-[calc(100vw-3rem)]"
                onPointerDownOutside={(event) => {
                    if (progress.running) event.preventDefault();
                }}
                onEscapeKeyDown={(event) => {
                    if (progress.running) event.preventDefault();
                }}
            >
                {/* Header and step rail stay fixed while the step scrolls. */}
                <div className="shrink-0 border-b border-border bg-gradient-to-br from-primary/[0.08] via-transparent to-cyan-400/[0.05] px-5 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-7">
                    <DialogHeader className="pe-10 text-start">
                        <div className="flex items-start gap-3.5">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/15 text-primary">
                                <FileArchive className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <DialogTitle className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                                    {_t("bulkExport.title")}
                                </DialogTitle>
                                <DialogDescription className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                    {_t("bulkExport.description")}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="mt-5 sm:hidden">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {_t("bulkExport.stepOf", {
                                    current: currentIndex + 1,
                                    total: STEPS.length,
                                })}
                            </p>
                            <p className="truncate text-xs font-medium text-foreground">
                                {currentStepLabel}
                            </p>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                            {STEPS.map((item, index) => (
                                <span
                                    key={item}
                                    className={cn(
                                        "h-1 rounded-full transition-colors",
                                        index <= currentIndex
                                            ? "bg-gradient-to-r from-primary to-cyan-400"
                                            : "bg-muted"
                                    )}
                                />
                            ))}
                        </div>
                    </div>

                    <ol className="mt-5 hidden grid-cols-4 gap-3 sm:grid">
                        {STEPS.map((item, index) => {
                            const active = item === step;
                            const complete = index < currentIndex;
                            const reachable = canEnter(item);

                            return (
                                <li key={item}>
                                    <button
                                        type="button"
                                        onClick={() => goTo(item)}
                                        disabled={!reachable}
                                        aria-current={
                                            active ? "step" : undefined
                                        }
                                        className="w-full text-left disabled:cursor-not-allowed"
                                    >
                                        <span className="flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                                                    active
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : complete
                                                          ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-600 dark:text-cyan-400"
                                                          : "border-border bg-muted/40 text-muted-foreground"
                                                )}
                                            >
                                                {complete ? (
                                                    <Check className="h-3.5 w-3.5" />
                                                ) : (
                                                    index + 1
                                                )}
                                            </span>
                                            <span
                                                className={cn(
                                                    "truncate text-xs font-medium",
                                                    active
                                                        ? "text-foreground"
                                                        : reachable
                                                          ? "text-muted-foreground"
                                                          : "text-muted-foreground/60"
                                                )}
                                            >
                                                {_t(`bulkExport.steps.${item}`)}
                                            </span>
                                        </span>
                                        <span className="mt-3 block h-1 overflow-hidden rounded-full bg-muted">
                                            <span
                                                className={cn(
                                                    "block h-full rounded-full transition-all duration-300",
                                                    complete || active
                                                        ? "w-full bg-gradient-to-r from-primary to-cyan-400"
                                                        : "w-0"
                                                )}
                                            />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </div>

                {/* Scrollable step content. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
                    {step === "upload" && (
                        <div className="space-y-6">
                            <StepHeader
                                icon={UploadCloud}
                                title={_t("bulkExport.upload.heading")}
                                description={_t(
                                    "bulkExport.upload.description"
                                )}
                            />

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
                                <div className="space-y-3">
                                    <input
                                        ref={fileInputRef}
                                        id="bulk-file-input"
                                        type="file"
                                        accept=".csv,.xls,.xlsx"
                                        className="sr-only"
                                        onChange={handleFileInput}
                                    />

                                    <label
                                        htmlFor="bulk-file-input"
                                        onDragOver={(event) =>
                                            event.preventDefault()
                                        }
                                        onDrop={handleDrop}
                                        className={cn(
                                            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.04] focus-within:ring-2 focus-within:ring-ring/40",
                                            parsing &&
                                                "pointer-events-none opacity-70"
                                        )}
                                    >
                                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/20 to-cyan-400/10 text-primary">
                                            {parsing ? (
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            ) : (
                                                <UploadCloud className="h-6 w-6" />
                                            )}
                                        </span>
                                        <span className="mt-4 text-base font-semibold text-foreground">
                                            {parsing
                                                ? _t(
                                                      "bulkExport.upload.parsing"
                                                  )
                                                : _t("bulkExport.upload.drop")}
                                        </span>
                                        <span className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                                            {_t("bulkExport.upload.hint")}
                                        </span>
                                        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            {_t("bulkExport.upload.supported")}
                                        </span>
                                    </label>

                                    {sheet && (
                                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 p-3">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                    <FileSpreadsheet className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-foreground">
                                                        {sheet.fileName}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {_t(
                                                            "bulkExport.map.rows",
                                                            {
                                                                count: sheet
                                                                    .rows
                                                                    .length,
                                                            }
                                                        )}
                                                        {" · "}
                                                        {
                                                            sheet.headers.length
                                                        }{" "}
                                                        columns
                                                    </p>
                                                </div>
                                            </div>
                                            <BaseButton
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    fileInputRef.current?.click()
                                                }
                                                className="shrink-0 border-border bg-muted/40 text-foreground hover:bg-muted"
                                            >
                                                {_t(
                                                    "bulkExport.upload.replace"
                                                )}
                                            </BaseButton>
                                        </div>
                                    )}

                                    {fileError && (
                                        <div
                                            role="alert"
                                            className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300"
                                        >
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                            {fileError}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                        <div className="flex items-center gap-2">
                                            <Download className="h-4 w-4 text-primary" />
                                            <h4 className="text-sm font-semibold text-foreground">
                                                {_t(
                                                    "bulkExport.upload.sampleHeading"
                                                )}
                                            </h4>
                                        </div>
                                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                            {_t("bulkExport.upload.sampleBody")}
                                        </p>

                                        <div className="mt-3 space-y-2">
                                            {[
                                                {
                                                    href: "/templates/sample_invoices.csv",
                                                    name: "sample_invoices.csv",
                                                    kind: "CSV",
                                                },
                                                {
                                                    href: "/templates/sample_invoices.xlsx",
                                                    name: "sample_invoices.xlsx",
                                                    kind: "XLSX",
                                                },
                                            ].map((sample) => (
                                                <a
                                                    key={sample.href}
                                                    href={sample.href}
                                                    download
                                                    className="group flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted"
                                                >
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                                                        <FileSpreadsheet className="h-4 w-4" />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-xs font-medium text-foreground">
                                                            {sample.name}
                                                        </span>
                                                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                                            {sample.kind} ·{" "}
                                                            {_t(
                                                                "bulkExport.upload.sampleMeta"
                                                            )}
                                                        </span>
                                                    </span>
                                                    <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                                            <h4 className="text-sm font-semibold text-foreground">
                                                {_t(
                                                    "bulkExport.upload.inheritHeading"
                                                )}
                                            </h4>
                                        </div>
                                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                            {_t(
                                                "bulkExport.upload.inheritBody"
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === "map" && sheet && (
                        <div className="space-y-5">
                            <StepHeader
                                icon={Table2}
                                title={_t("bulkExport.map.heading")}
                                description={_t("bulkExport.map.description")}
                            />

                            {missingRequired.length > 0 ? (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200"
                                >
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    {_t("bulkExport.map.requiredMissing", {
                                        fields: missingRequired
                                            .map((key) =>
                                                _t(`bulkExport.fields.${key}`)
                                            )
                                            .join(", "),
                                    })}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    {_t("bulkExport.map.groupHint", {
                                        count: built.invoices.length,
                                    })}
                                </div>
                            )}

                            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        {_t("bulkExport.map.requiredHeading")}
                                    </h4>
                                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                                        {requiredFields.length}
                                    </span>
                                </div>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    {requiredFields.map((field) => (
                                        <MappingSelect
                                            key={field.key}
                                            field={field}
                                            value={mapping[field.key]}
                                            headers={sheet.headers}
                                            onChange={(header) =>
                                                setMapping((previous) => ({
                                                    ...previous,
                                                    [field.key]: header,
                                                }))
                                            }
                                        />
                                    ))}
                                </div>
                            </div>

                            <div
                                ref={optionalFieldsRef}
                                className="rounded-2xl border border-border bg-muted/50"
                            >
                                <button
                                    type="button"
                                    onClick={toggleOptionalFields}
                                    aria-expanded={optionalExpanded}
                                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60"
                                >
                                    <div>
                                        <h4 className="text-sm font-semibold text-foreground">
                                            {_t(
                                                "bulkExport.map.optionalHeading"
                                            )}
                                        </h4>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                                            {_t("bulkExport.map.optionalHint")}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                            {_t("bulkExport.map.mapped", {
                                                count: optionalMapped,
                                            })}
                                            {" / "}
                                            {optionalFields.length}
                                        </span>
                                        <ChevronDown
                                            className={cn(
                                                "h-4 w-4 text-muted-foreground transition-transform",
                                                optionalExpanded && "rotate-180"
                                            )}
                                        />
                                    </div>
                                </button>

                                {optionalExpanded && (
                                    <div className="border-t border-border p-4">
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {optionalFields.map((field) => (
                                                <MappingSelect
                                                    key={field.key}
                                                    field={field}
                                                    value={mapping[field.key]}
                                                    headers={sheet.headers}
                                                    onChange={(header) =>
                                                        setMapping(
                                                            (previous) => ({
                                                                ...previous,
                                                                [field.key]:
                                                                    header,
                                                            })
                                                        )
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-border bg-muted/50">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Table2 className="h-4 w-4 text-primary" />
                                        <h4 className="text-sm font-semibold text-foreground">
                                            {_t("bulkExport.map.sourceHeading")}
                                        </h4>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                        {_t("bulkExport.map.sourceHint", {
                                            count: Math.min(
                                                4,
                                                sheet.rows.length
                                            ),
                                        })}
                                    </span>
                                </div>
                                <div className="max-h-64 overflow-auto">
                                    <table className="w-full min-w-[44rem] border-collapse text-[11px]">
                                        <thead className="sticky top-0 z-10 bg-muted">
                                            <tr>
                                                {sheet.headers.map((header) => (
                                                    <th
                                                        key={header}
                                                        className="whitespace-nowrap border-b border-border px-3 py-2.5 text-start font-medium text-muted-foreground"
                                                    >
                                                        {header}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sheet.rows
                                                .slice(0, 4)
                                                .map((row, rowIndex) => (
                                                    <tr
                                                        key={rowIndex}
                                                        className="border-b border-border last:border-0 hover:bg-muted/60"
                                                    >
                                                        {sheet.headers.map(
                                                            (header) => (
                                                                <td
                                                                    key={header}
                                                                    className="max-w-[14rem] truncate whitespace-nowrap px-3 py-2 text-muted-foreground"
                                                                >
                                                                    {formatCell(
                                                                        row[
                                                                            header
                                                                        ]
                                                                    )}
                                                                </td>
                                                            )
                                                        )}
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {(issues.length > 0 || warnings.length > 0) && (
                                <IssueList
                                    issues={[...issues, ...warnings]}
                                    heading={_t("bulkExport.map.issuesHeading")}
                                />
                            )}
                        </div>
                    )}

                    {step === "style" && (
                        <div className="space-y-6">
                            <StepHeader
                                icon={Palette}
                                title={_t("bulkExport.style.heading")}
                                description={_t("bulkExport.style.description")}
                            />

                            <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        {_t("bulkExport.style.templateHeading")}
                                    </h4>
                                    <span className="text-[11px] text-muted-foreground">
                                        {selectedTemplate.name}
                                    </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                                    {TEMPLATES.map((template) => {
                                        const active =
                                            template.id === style.templateId;

                                        return (
                                            <button
                                                key={template.id}
                                                type="button"
                                                aria-pressed={active}
                                                onClick={() =>
                                                    setStyle((previous) => ({
                                                        ...previous,
                                                        templateId: template.id,
                                                    }))
                                                }
                                                className={cn(
                                                    "group relative rounded-xl border p-3 text-left transition-colors",
                                                    active
                                                        ? "border-primary/70 bg-primary/10"
                                                        : "border-border bg-muted/40 hover:border-border hover:bg-muted/70"
                                                )}
                                            >
                                                <span className="flex items-center justify-between">
                                                    <span className="font-mono text-[10px] text-muted-foreground">
                                                        {String(
                                                            template.id
                                                        ).padStart(2, "0")}
                                                    </span>
                                                    {active && (
                                                        <Check className="h-3.5 w-3.5 text-primary" />
                                                    )}
                                                </span>
                                                <span className="mt-2 block text-xs font-semibold text-foreground">
                                                    {template.name}
                                                </span>
                                                <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-muted-foreground">
                                                    {template.description}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-3">
                                <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        {_t("bulkExport.style.fontHeading")}
                                    </h4>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {INVOICE_FONTS.map((font) => {
                                            const active =
                                                font.id === style.fontId;

                                            return (
                                                <button
                                                    key={font.id}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() =>
                                                        setStyle(
                                                            (previous) => ({
                                                                ...previous,
                                                                fontId: font.id as InvoiceFontId,
                                                            })
                                                        )
                                                    }
                                                    className={cn(
                                                        "rounded-xl border p-3 text-left transition-colors",
                                                        active
                                                            ? "border-primary/70 bg-primary/10"
                                                            : "border-border bg-muted/40 hover:border-border"
                                                    )}
                                                >
                                                    <span
                                                        className="block text-2xl leading-none text-foreground"
                                                        style={{
                                                            fontFamily:
                                                                font.stack,
                                                        }}
                                                    >
                                                        Aa
                                                    </span>
                                                    <span className="mt-2 block text-[11px] font-medium text-foreground/80">
                                                        {font.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                    <h4 className="text-sm font-semibold text-foreground">
                                        {_t("bulkExport.style.densityHeading")}
                                    </h4>
                                    <div className="mt-3 space-y-1.5 rounded-xl border border-border bg-muted/40 p-1">
                                        {DENSITIES.map((density) => {
                                            const active =
                                                density === style.density;

                                            return (
                                                <button
                                                    key={density}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() =>
                                                        setStyle(
                                                            (previous) => ({
                                                                ...previous,
                                                                density,
                                                            })
                                                        )
                                                    }
                                                    className={cn(
                                                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors",
                                                        active
                                                            ? "bg-muted text-foreground shadow-sm"
                                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    )}
                                                >
                                                    {_t(
                                                        `bulkExport.densities.${density}`
                                                    )}
                                                    {active && (
                                                        <Check className="h-3.5 w-3.5 text-primary" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className="text-sm font-semibold text-foreground">
                                            {_t(
                                                "bulkExport.style.accentHeading"
                                            )}
                                        </h4>
                                        <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                                            {style.accentColor}
                                        </span>
                                    </div>
                                    <div className="mt-4 grid grid-cols-5 place-items-center gap-2">
                                        {ACCENT_PRESETS.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                title={preset.name}
                                                aria-label={preset.name}
                                                aria-pressed={
                                                    style.accentColor ===
                                                    preset.value
                                                }
                                                onClick={() =>
                                                    setStyle((previous) => ({
                                                        ...previous,
                                                        accentColor:
                                                            preset.value,
                                                    }))
                                                }
                                                className={cn(
                                                    "h-8 w-8 rounded-full border-2 ring-1 ring-inset ring-black/20 transition-transform hover:scale-105 dark:ring-white/20",
                                                    /*
                                                     * `border-foreground`, not
                                                     * `border-white`: the
                                                     * selected swatch needs a
                                                     * ring that contrasts with
                                                     * the panel, and a white one
                                                     * disappears on a white
                                                     * panel.
                                                     */
                                                    style.accentColor ===
                                                        preset.value
                                                        ? "border-foreground"
                                                        : "border-transparent"
                                                )}
                                                style={{
                                                    backgroundColor:
                                                        preset.value,
                                                }}
                                            />
                                        ))}
                                        <label
                                            className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-muted/60"
                                            title={_t(
                                                "bulkExport.style.customColor"
                                            )}
                                        >
                                            <Palette className="h-3.5 w-3.5 text-foreground/80" />
                                            <input
                                                type="color"
                                                value={style.accentColor}
                                                onChange={(event) =>
                                                    setStyle((previous) => ({
                                                        ...previous,
                                                        accentColor:
                                                            event.target.value,
                                                    }))
                                                }
                                                className="sr-only"
                                                aria-label={_t(
                                                    "bulkExport.style.customColor"
                                                )}
                                            />
                                        </label>
                                    </div>
                                    <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                                        {_t("bulkExport.style.appliesToAll")}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                                {_t("bulkExport.style.inheritHint")}
                            </div>
                        </div>
                    )}

                    {step === "preview" && (
                        <div className="space-y-5">
                            <StepHeader
                                icon={FileArchive}
                                title={_t("bulkExport.preview.heading")}
                                description={_t(
                                    "bulkExport.preview.description"
                                )}
                            />

                            {built.invoices.length > 0 ? (
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
                                    <div className="rounded-2xl border border-border bg-muted/40 p-3 sm:p-4">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                {_t(
                                                    "bulkExport.preview.firstPage"
                                                )}
                                            </p>
                                            <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                {selectedTemplate.name}
                                            </span>
                                        </div>
                                        <BulkInvoicePreview
                                            invoice={built.invoices[0]}
                                            labels={labels}
                                            locale={locale}
                                            fit="contain"
                                            className="h-[54vh] min-h-[20rem] max-h-[36rem]"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                            <div className="flex items-center gap-2">
                                                <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
                                                <p className="min-w-0 truncate text-xs font-medium text-foreground/80">
                                                    {sheet?.fileName}
                                                </p>
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2">
                                                <Metric
                                                    label={_t(
                                                        "bulkExport.preview.invoicesLabel"
                                                    )}
                                                    value={
                                                        built.invoices.length
                                                    }
                                                />
                                                <Metric
                                                    label={_t(
                                                        "bulkExport.preview.itemsLabel"
                                                    )}
                                                    value={totalItems}
                                                />
                                                <Metric
                                                    label={_t(
                                                        "bulkExport.preview.totalLabel"
                                                    )}
                                                    value={formatBatchTotal(
                                                        built.invoices,
                                                        locale
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        {!result && !progress.running && (
                                            <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                                                    <h4 className="text-sm font-semibold text-foreground">
                                                        {_t(
                                                            "bulkExport.preview.readyHeading"
                                                        )}
                                                    </h4>
                                                </div>
                                                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                                    {_t(
                                                        "bulkExport.preview.readyBody"
                                                    )}
                                                </p>
                                                <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                                    <FileArchive className="h-3.5 w-3.5" />
                                                    invoices_bulk_export.zip
                                                </p>
                                            </div>
                                        )}

                                        {(progress.running || result) && (
                                            <div className="rounded-2xl border border-border bg-muted/60 p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                                        {result ? (
                                                            result.failed
                                                                .length > 0 ? (
                                                                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                                                            ) : (
                                                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                            )
                                                        ) : (
                                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                        )}
                                                        {result
                                                            ? result.failed
                                                                  .length > 0
                                                                ? _t(
                                                                      "bulkExport.preview.failedHeading"
                                                                  )
                                                                : _t(
                                                                      "bulkExport.preview.completeHeading"
                                                                  )
                                                            : progressLabel}
                                                    </p>
                                                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                                        {progressValue}%
                                                    </span>
                                                </div>
                                                <Progress
                                                    value={progressValue}
                                                    className="mt-3 h-2 bg-muted"
                                                    indicatorClassName="bg-gradient-to-r from-primary to-cyan-400"
                                                />
                                                <p
                                                    aria-live="polite"
                                                    className="mt-2 text-[11px] leading-relaxed text-muted-foreground"
                                                >
                                                    {resultText ??
                                                        _t(
                                                            "bulkExport.export.summary",
                                                            {
                                                                count: built
                                                                    .invoices
                                                                    .length,
                                                            }
                                                        )}
                                                </p>
                                            </div>
                                        )}

                                        {(issues.length > 0 ||
                                            warnings.length > 0) && (
                                            <IssueList
                                                issues={[
                                                    ...issues,
                                                    ...warnings,
                                                ]}
                                                heading={_t(
                                                    "bulkExport.preview.issuesHeading"
                                                )}
                                            />
                                        )}

                                        {zipError && (
                                            <div
                                                role="alert"
                                                className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300"
                                            >
                                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                                {zipError}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 text-center">
                                    <AlertTriangle className="mx-auto h-6 w-6 text-amber-700 dark:text-amber-300" />
                                    <p className="mt-3 text-sm text-amber-800 dark:text-amber-100">
                                        {_t("bulkExport.preview.noInvoices")}
                                    </p>
                                    <BaseButton
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 border-border bg-muted/40 text-foreground hover:bg-muted"
                                        onClick={() => goTo("map")}
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        {_t("bulkExport.preview.backToMapping")}
                                    </BaseButton>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Persistent actions. */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-8">
                    <BaseButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenChange(false)}
                        disabled={progress.running}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        {_t("bulkExport.nav.close")}
                    </BaseButton>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {currentIndex > 0 && !result && (
                            <BaseButton
                                variant="outline"
                                size="sm"
                                onClick={back}
                                disabled={progress.running}
                                className="border-border bg-muted/40 text-foreground hover:bg-muted hover:text-foreground"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {_t("bulkExport.nav.back")}
                            </BaseButton>
                        )}

                        {currentIndex < STEPS.length - 1 && (
                            <BaseButton
                                size="sm"
                                onClick={next}
                                disabled={!canContinue || progress.running}
                            >
                                {_t("bulkExport.nav.continue")}
                                <ArrowRight className="h-4 w-4" />
                            </BaseButton>
                        )}

                        {currentIndex === STEPS.length - 1 && !result && (
                            <BaseButton
                                size="sm"
                                onClick={() => void startExport()}
                                loading={progress.running}
                                loadingText={_t("bulkExport.export.working")}
                                disabled={
                                    built.invoices.length === 0 ||
                                    progress.running
                                }
                            >
                                <Sparkles className="h-4 w-4" />
                                {_t("bulkExport.nav.start")}
                            </BaseButton>
                        )}

                        {result && (
                            <BaseButton
                                variant="outline"
                                size="sm"
                                onClick={reset}
                                className="border-border bg-muted/40 text-foreground hover:bg-muted hover:text-foreground"
                            >
                                <RefreshCw className="h-4 w-4" />
                                {_t("bulkExport.nav.startAgain")}
                            </BaseButton>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default BulkExportModal;
