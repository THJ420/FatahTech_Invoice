"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

// Next Intl
import { useLocale, useMessages } from "next-intl";

// RHF
import { useFormContext } from "react-hook-form";

// Hooks
import useToasts from "@/hooks/useToasts";

// Services
import { exportInvoice } from "@/services/invoice/client/exportInvoice";
import { printInvoice as printInvoiceDocument } from "@/services/invoice/client/printInvoice";

// Invoice document labels
import { buildInvoiceLabels } from "@/app/components/templates/invoice-pdf/invoiceLabels";

// Validation
import { InvoiceSchema } from "@/lib/schemas";

// Helpers
import { nextInvoiceNumber } from "@/lib/invoiceNumber";
import { buildSampleInvoice } from "@/lib/sampleInvoice";

// Variables
import {
  FORM_DEFAULT_VALUES,
  SHORT_DATE_OPTIONS,
  LOCAL_STORAGE_INVOICE_DRAFT_KEY,
  DRAFT_SAVE_DEBOUNCE_MS,
} from "@/lib/variables";

// Storage
import { readSecure, removeSecure, writeSecure } from "@/lib/secureStore";

// Types
import { ExportTypes, InvoiceType } from "@/types";

/**
 * Unprefixed, unlike the namespaced fatahtech: keys — this one predates that
 * convention, and renaming it would orphan every invoice anyone has saved.
 */
const SAVED_INVOICES_KEY = "savedInvoices";

const defaultInvoiceContext = {
  printLoading: false,
  savedInvoices: [] as InvoiceType[],
  /** Timestamp of the last successful draft write, for the autosave indicator. */
  draftSavedAt: null as number | null,
  /** True while edits are sitting in the debounce window, unwritten. */
  draftPending: false,
  onFormSubmit: (values: InvoiceType) => {},
  newInvoice: () => {},
  fillWithSampleData: () => {},
  clearForm: () => {},
  printInvoice: async (data?: InvoiceType) => {},
  saveInvoice: () => {},
  deleteInvoice: (index: number) => {},
  exportInvoiceAs: (exportAs: ExportTypes) => {},
  importInvoice: (file: File) => {},
};

export const InvoiceContext = createContext(defaultInvoiceContext);

export const useInvoiceContext = () => {
  return useContext(InvoiceContext);
};

type InvoiceContextProviderProps = {
  children: React.ReactNode;
};

export const InvoiceContextProvider = ({
  children,
}: InvoiceContextProviderProps) => {
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages();

  // Toasts
  const {
    newInvoiceSuccess,
    saveInvoiceSuccess,
    modifiedInvoiceSuccess,
    formFilledWithSample,
    formCleared,
    printInvoiceError,
    exportInvoiceError,
    importInvoiceError,
    formValidationError,
  } = useToasts();

  // Get form values and methods from form context
  const { getValues, reset, watch } = useFormContext<InvoiceType>();

  // The same labels the live preview renders with, so the printout matches.
  const labels = useMemo(
    () => buildInvoiceLabels(messages as Record<string, unknown>),
    [messages]
  );

  // True while a print document is being prepared and handed to the browser.
  const [printLoading, setPrintLoading] = useState<boolean>(false);

  // Saved invoices
  const [savedInvoices, setSavedInvoices] = useState<InvoiceType[]>([]);

  useEffect(() => {
    let active = true;
    // Encrypted at rest, so this is a promise now. The guard keeps a late
    // resolve from writing into an unmounted provider.
    readSecure<InvoiceType[]>(SAVED_INVOICES_KEY).then((saved) => {
      if (active) setSavedInvoices(Array.isArray(saved) ? saved : []);
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Draft autosave.
   *
   * This used to `JSON.stringify` the entire invoice inside the `watch`
   * callback — i.e. on every keystroke, synchronously. The invoice carries
   * `details.invoiceLogo`, a base64 data URL allowed up to 3,000,000
   * characters, so with a logo uploaded each character typed serialised
   * megabytes on the main thread. That was the single largest source of the
   * typing lag, and it was also what made modals feel slow: they open while
   * the user is mid-interaction, so the two costs landed together.
   *
   * Now the latest value is parked in a ref and written on a trailing timer.
   * The flush also runs when the tab is hidden or unloaded, so nothing is lost
   * if the user leaves inside the debounce window.
   */
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftPending, setDraftPending] = useState(false);
  const pendingDraftRef = useRef<unknown>(null);

  /*
   * Encryption makes this async, which costs one guarantee worth naming: a tab
   * killed inside the 600ms debounce may not finish the write, where the old
   * synchronous setItem would have. The visibilitychange-to-hidden flush below
   * is unaffected and fires on every ordinary way of leaving a page, so the
   * loss window is narrow.
   */
  const flushDraft = useCallback(() => {
    if (pendingDraftRef.current === null) return;
    const payload = pendingDraftRef.current;
    pendingDraftRef.current = null;

    void writeSecure(LOCAL_STORAGE_INVOICE_DRAFT_KEY, payload).then((ok) => {
      // A false result is quota, disabled storage, or no usable key. The draft
      // is a convenience, not a guarantee, so a failure must not break editing
      // — but it must not report "Saved" either.
      if (ok) setDraftSavedAt(Date.now());
    });

    setDraftPending(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const subscription = watch((value) => {
      pendingDraftRef.current = value;
      setDraftPending(true);

      if (timer) clearTimeout(timer);
      timer = setTimeout(flushDraft, DRAFT_SAVE_DEBOUNCE_MS);
    });

    // `pagehide` rather than `unload`, which is ignored on mobile Safari and
    // blocks the back/forward cache everywhere else.
    const onHide = () => flushDraft();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      subscription.unsubscribe();
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushDraft();
    };
  }, [watch, flushDraft]);

  /**
   * Handles form submission.
   *
   * @param {InvoiceType} data - The form values used to print the invoice.
   */
  const onFormSubmit = (data: InvoiceType) => {
    void printInvoice(data);
  };

  /**
   * Prints the invoice with the browser's native print engine.
   *
   * Rendering happens entirely in the browser, so nothing is uploaded and no
   * server round trip is needed. The invoice is laid out in an off-screen A4
   * frame and the print dialog is opened on it; if the browser refuses to print
   * a frame, the service falls back to an in-app print view.
   *
   * @param {InvoiceType} [data] - Form values to print. Defaults to the
   * current form state.
   */
  const printInvoice = useCallback(
    async (data?: InvoiceType) => {
      const values = data ?? getValues();

      /*
       * The form can be printed without going through submit (the toolbar
       * button calls this directly so the popup keeps its user gesture), so
       * validate here rather than printing a half-empty document.
       */
      const parsed = InvoiceSchema.safeParse(values);
      if (!parsed.success) {
        console.error("Invalid invoice:", parsed.error.issues);
        formValidationError();
        return;
      }

      setPrintLoading(true);

      try {
        await printInvoiceDocument({
          data: parsed.data,
          labels,
          locale,
        });
      } catch (error) {
        console.error("Error printing invoice:", error);
        printInvoiceError();
      } finally {
        setPrintLoading(false);
      }
    },
    [
      getValues,
      labels,
      locale,
      formValidationError,
      printInvoiceError,
    ]
  );

  /**
   * Generates a new invoice.
   */
  const newInvoice = () => {
    /*
     * Suggest the next number rather than leaving the field blank.
     *
     * Derived from the most recent saved invoice, preserving whatever scheme
     * it used — INV0007 -> INV0008, 2026-14 -> 2026-15. It is only a
     * suggestion: the field stays a normal editable input, because an invoice
     * number is a legal identifier and people have their own conventions.
     */
    reset({
      ...FORM_DEFAULT_VALUES,
      details: {
        ...FORM_DEFAULT_VALUES.details,
        invoiceNumber: nextInvoiceNumber(savedInvoices),
      },
    });

    // Clear the draft
    void removeSecure(LOCAL_STORAGE_INVOICE_DRAFT_KEY);

    router.refresh();

    // Toast
    newInvoiceSuccess();
  };

  /**
   * Replaces the form with a complete example invoice.
   *
   * The template and the theme are carried over from whatever the user is
   * currently editing. The button exists to show a finished document, so
   * quietly resetting their chosen layout at the same time would be a surprise
   * unrelated to the data it fills in.
   */
  const fillWithSampleData = () => {
    const current = getValues();

    reset(
      buildSampleInvoice({
        pdfTemplate: current.details?.pdfTemplate,
        theme: current.details?.theme,
      })
    );

    formFilledWithSample();
  };

  /**
   * Clears the form back to its blank defaults.
   *
   * `reset` on its own would leave the autosaved draft in place, so the next
   * reload would restore exactly what the user just cleared. The pending value
   * is dropped too — otherwise the debounce timer would write the form it is
   * holding right back over the cleared one.
   */
  const clearForm = () => {
    reset(FORM_DEFAULT_VALUES);

    pendingDraftRef.current = null;
    setDraftPending(false);
    setDraftSavedAt(null);

    void removeSecure(LOCAL_STORAGE_INVOICE_DRAFT_KEY);

    formCleared();
  };

  // TODO: Change function name. (saveInvoiceData maybe?)
  /**
   * Saves the invoice data to local storage.
   */
  const saveInvoice = async () => {
    // If get values function is provided, allow to save the invoice
    if (!getValues) return;

    // Retrieve the existing array from storage or initialize an empty array
    const stored = await readSecure<InvoiceType[]>(SAVED_INVOICES_KEY);
    const savedInvoices: InvoiceType[] = Array.isArray(stored) ? stored : [];

    const updatedDate = new Date().toLocaleDateString(
      "en-US",
      SHORT_DATE_OPTIONS
    );

    const formValues = getValues();
    formValues.details.updatedAt = updatedDate;

    const existingInvoiceIndex = savedInvoices.findIndex(
      (invoice: InvoiceType) => {
        return (
          invoice.details.invoiceNumber === formValues.details.invoiceNumber
        );
      }
    );

    // If invoice already exists
    if (existingInvoiceIndex !== -1) {
      savedInvoices[existingInvoiceIndex] = formValues;

      // Toast
      modifiedInvoiceSuccess();
    } else {
      // Add the form values to the array
      savedInvoices.push(formValues);

      // Toast
      saveInvoiceSuccess();
    }

    await writeSecure(SAVED_INVOICES_KEY, savedInvoices);

    setSavedInvoices(savedInvoices);
  };

  // TODO: Change function name. (deleteInvoiceData maybe?)
  /**
   * Delete an invoice from local storage based on the given index.
   *
   * @param {number} index - The index of the invoice to be deleted.
   */
  const deleteInvoice = (index: number) => {
    if (index >= 0 && index < savedInvoices.length) {
      const updatedInvoices = [...savedInvoices];
      updatedInvoices.splice(index, 1);
      setSavedInvoices(updatedInvoices);

      void writeSecure(SAVED_INVOICES_KEY, updatedInvoices);
    }
  };

  /**
   * Export an invoice in the specified format using the provided form values.
   *
   * This function initiates the export process with the chosen export format and the form data.
   *
   * @param {ExportTypes} exportAs - The format in which to export the invoice.
   */
  const exportInvoiceAs = (exportAs: ExportTypes) => {
    const formValues = getValues();

    exportInvoice(exportAs, formValues).catch((error) => {
      console.error("Error exporting invoice:", error);
      exportInvoiceError(
        error instanceof Error ? error.message : undefined
      );
    });
  };

  /**
   * Import an invoice from a JSON file.
   *
   * @param {File} file - The JSON file to import.
   */
  const importInvoice = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);

        // Parse the dates
        if (importedData.details) {
          if (importedData.details.invoiceDate) {
            importedData.details.invoiceDate = new Date(
              importedData.details.invoiceDate
            );
          }
          if (importedData.details.dueDate) {
            importedData.details.dueDate = new Date(
              importedData.details.dueDate
            );
          }
        }

        /*
         * Validate before resetting. This file is arbitrary user input, and an
         * unvalidated reset() put malformed shapes straight into form state,
         * which then flowed on to the template renderer and the exports.
         */
        const validated = InvoiceSchema.safeParse(importedData);
        if (!validated.success) {
          console.error("Invalid invoice file:", validated.error.issues);
          importInvoiceError();
          return;
        }

        // Reset form with imported data
        reset(importedData);
      } catch (error) {
        console.error("Error parsing JSON file:", error);
        importInvoiceError();
      }
    };
    reader.readAsText(file);
  };

  return (
    <InvoiceContext.Provider
      value={{
        printLoading,
        savedInvoices,
        draftSavedAt,
        draftPending,
        onFormSubmit,
        newInvoice,
        fillWithSampleData,
        clearForm,
        printInvoice,
        saveInvoice,
        deleteInvoice,
        exportInvoiceAs,
        importInvoice,
      }}
    >
      {children}
    </InvoiceContext.Provider>
  );
};
