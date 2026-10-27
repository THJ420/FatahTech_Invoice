// Zod
import z from "zod";

// RHF
import { FieldPath, UseFormReturn } from "react-hook-form";

// Zod schemas
import { InvoiceSchema, ItemSchema } from "@/lib/schemas";

// Form types
export type InvoiceType = z.infer<typeof InvoiceSchema>;
export type ItemType = z.infer<typeof ItemSchema>;
export type FormType = UseFormReturn<InvoiceType>;
export type NameType = FieldPath<InvoiceType>;
export type CurrencyType = {
    [currencyCode: string]: string;
};

export type CurrencyDetails = {
    currency: string;
    decimals: number;
    beforeDecimal: string | null;
    afterDecimal: string | null;
};

// Signature types
export type SignatureColor = {
    name: string;
    label: string;
    color: string;
};

export type SignatureFont = {
    name: string;
    variable: string;
};

export enum SignatureTabs {
    DRAW = "draw",
    TYPE = "type",
    UPLOAD = "upload",
}

// Export types
export enum ExportTypes {
    JSON = "JSON",
    CSV = "CSV",
    XML = "XML",
    XLSX = "XLSX",
    DOCX = "DOCX",
    /*
     * EN 16931 e-invoices. XRechnung is the German CIUS in both syntaxes;
     * ZUGFeRD_CII is the plain EN 16931 CII XML.
     *
     * The ZUGFeRD PDF hybrid is intentionally absent: it needed a generated
     * PDF to attach the XML to, and invoices are now printed by the browser
     * rather than produced as a file by the server.
     */
    XRECHNUNG_UBL = "XRECHNUNG_UBL",
    XRECHNUNG_CII = "XRECHNUNG_CII",
    ZUGFERD_CII = "ZUGFERD_CII",
}
