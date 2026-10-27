"use client";

// Components
import {
    CurrencySelector,
    DatePickerFormField,
    FormInput,
    FormFile,
    FormTextarea,
    Subheading,
    TemplateGallery,
} from "@/app/components";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Hooks
import { useIsDesktop } from "@/hooks/useMediaQuery";

const InvoiceDetails = () => {
    const { _t } = useTranslationContext();

    /*
     * Above xl the template, accent and density controls live in the preview
     * toolbar beside the invoice, which is where option B puts them and where
     * they belong — they change the document, not the data. Below xl there is
     * no toolbar, so they stay here.
     *
     * Gated on the hook rather than a CSS `xl:hidden` so only one of the two
     * mounts: two TemplateGallery instances would mean two dialogs.
     */
    const isDesktop = useIsDesktop();

    return (
        <section className="flex flex-col flex-wrap gap-5">
            <Subheading>{_t("form.steps.invoiceDetails.heading")}:</Subheading>

            <div className="grid grid-cols-1 gap-8">
                <div className="flex min-w-0 flex-col gap-3">
                    <FormFile
                        name="details.invoiceLogo"
                        label={_t(
                            "form.steps.invoiceDetails.invoiceLogo.label"
                        )}
                        placeholder={_t(
                            "form.steps.invoiceDetails.invoiceLogo.placeholder"
                        )}
                    />

                    <FormInput
                        name="details.invoiceNumber"
                        label={_t("form.steps.invoiceDetails.invoiceNumber")}
                        placeholder={_t(
                            "form.steps.invoiceDetails.invoiceNumberPlaceholder"
                        )}
                    />

                    <DatePickerFormField
                        name="details.invoiceDate"
                        label={_t("form.steps.invoiceDetails.issuedDate")}
                    />

                    <DatePickerFormField
                        name="details.dueDate"
                        label={_t("form.steps.invoiceDetails.dueDate")}
                    />

                    <CurrencySelector
                        name="details.currency"
                        label={_t("form.steps.invoiceDetails.currency")}
                        placeholder={_t(
                            "form.steps.invoiceDetails.currencyPlaceholder"
                        )}
                    />

                    {/*
                     * Both of these exist for the EN 16931 e-invoice export.
                     * The purchase order is the closest thing the form has to
                     * a buyer reference (BT-10), and the tax ID is the seller
                     * VAT / tax registration number XRechnung requires.
                     */}
                    <FormInput
                        name="details.purchaseOrderNumber"
                        label={_t(
                            "form.steps.invoiceDetails.purchaseOrderNumber"
                        )}
                        labelHelper={_t(
                            "form.steps.invoiceDetails.purchaseOrderNumberHelper"
                        )}
                        placeholder={_t(
                            "form.steps.invoiceDetails.purchaseOrderNumberPlaceholder"
                        )}
                    />

                    <FormInput
                        name="details.taxDetails.taxID"
                        label={_t("form.steps.invoiceDetails.taxId")}
                        labelHelper={_t(
                            "form.steps.invoiceDetails.taxIdHelper"
                        )}
                        placeholder={_t(
                            "form.steps.invoiceDetails.taxIdPlaceholder"
                        )}
                    />

                    {/*
                     * Custom header and footer. Both are optional and both
                     * render live in the preview beside the form, which is the
                     * "live preview" part of the request — no separate modal
                     * and no save step.
                     */}
                    <FormTextarea
                        name="details.headerText"
                        label={_t("form.steps.invoiceDetails.headerText")}
                        labelHelper={_t(
                            "form.steps.invoiceDetails.headerHelper"
                        )}
                        placeholder={_t(
                            "form.steps.invoiceDetails.headerPlaceholder"
                        )}
                        rows={2}
                    />

                    <FormTextarea
                        name="details.footerText"
                        label={_t("form.steps.invoiceDetails.footerText")}
                        labelHelper={_t(
                            "form.steps.invoiceDetails.footerHelper"
                        )}
                        placeholder={_t(
                            "form.steps.invoiceDetails.footerPlaceholder"
                        )}
                        rows={2}
                    />
                </div>

                {!isDesktop && (
                    <div className="flex min-w-0 flex-col gap-2">
                        <TemplateGallery />
                    </div>
                )}
            </div>
        </section>
    );
};

export default InvoiceDetails;
