import { z } from "zod";

// Variables
import { DATE_OPTIONS, SIGNATURE_FONTS } from "@/lib/variables";

// Number guards
import { MAX_AMOUNT, MAX_LINE_TOTAL, MAX_QUANTITY } from "@/lib/safeNumber";

/**
 * Roughly 2MB of binary once base64-decoded — generous for a logo, but bounded.
 */
const MAX_LOGO_CHARS = 3_000_000;

/**
 * Text limits.
 *
 * These used to be much tighter (a company name stopped at 50 characters, an
 * email at 30). That is shorter than an ordinary Russian or German company
 * name, so perfectly valid invoices failed validation with a message about
 * "50 characters" that had nothing to do with what the user typed. The caps
 * below are sanity limits for the invoice document and the request body, not
 * business rules.
 */
const MAX_NAME = 200;
const MAX_ADDRESS = 400;
const MAX_ZIP = 40;
const MAX_CITY = 120;
const MAX_COUNTRY = 120;
const MAX_EMAIL = 254; // RFC 5321
const MAX_PHONE = 60;
const MAX_TEXT = 5_000;
const MAX_CUSTOM_FIELD = 500;

/**
 * The logo is rendered as `<img src>` inside the HTML handed to Puppeteer, so
 * an arbitrary URL here means the server fetches it — a straightforward SSRF
 * into cloud metadata endpoints or internal services. The app only ever
 * produces base64 data URLs (see FormFile), so anything else is rejected.
 */
const imageDataUrl = z
    .string()
    .max(MAX_LOGO_CHARS, { message: "Logo is too large" })
    .refine((value) => value === "" || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value), {
        message: "Logo must be an embedded image",
    });

/**
 * A required string with a generous upper bound.
 *
 * `max` still exists because an unbounded string in a JSON body is a memory
 * problem, but it is far above any legitimate invoice field.
 */
const boundedString = (max: number, label = "This field") =>
    z
        .string()
        .max(max, { message: `${label} must be at most ${max} characters` });

// Field Validators
const fieldValidators = {
    name: z
        .string()
        .min(2, { message: "Must be at least 2 characters" })
        .max(MAX_NAME, {
            message: `Must be at most ${MAX_NAME} characters`,
        }),
    address: z
        .string()
        .min(2, { message: "Must be at least 2 characters" })
        .max(MAX_ADDRESS, {
            message: `Must be at most ${MAX_ADDRESS} characters`,
        }),
    zipCode: z
        .string()
        .min(1, { message: "Must be at least 1 character" })
        .max(MAX_ZIP, { message: `Must be at most ${MAX_ZIP} characters` }),
    city: z
        .string()
        .min(1, { message: "Must be at least 1 character" })
        .max(MAX_CITY, { message: `Must be at most ${MAX_CITY} characters` }),
    country: z
        .string()
        .min(1, { message: "Must be at least 1 character" })
        .max(MAX_COUNTRY, {
            message: `Must be at most ${MAX_COUNTRY} characters`,
        }),
    email: z
        .string()
        .email({ message: "Email must be a valid email" })
        .min(5, { message: "Must be at least 5 characters" })
        .max(MAX_EMAIL, {
            message: `Must be at most ${MAX_EMAIL} characters`,
        }),
    phone: z
        .string()
        .min(1, { message: "Must be at least 1 character" })
        .max(MAX_PHONE, {
            message: `Must be at most ${MAX_PHONE} characters`,
        }),

    /*
     * Dates.
     *
     * On the client react-hook-form holds real Date objects, but JSON has no
     * date type — over the wire these arrive as ISO strings. A bare `z.date()`
     * therefore passes in the browser and fails on the server, so accept both
     * and normalise. The `.pipe` keeps the existing display-string transform.
     */
    date: z
        .union([z.date(), z.string(), z.number()])
        .pipe(z.coerce.date())
        .transform((date) =>
            new Date(date).toLocaleDateString("en-US", DATE_OPTIONS)
        ),

    // Items
    quantity: z.coerce
        .number()
        .finite({ message: "Must be a finite number" })
        .gt(0, { message: "Must be a number greater than 0" })
        .max(MAX_QUANTITY, {
            message: `Must be ≤ ${MAX_QUANTITY.toLocaleString("en-US")}`,
        }),
    unitPrice: z.coerce
        .number()
        .finite({ message: "Must be a finite number" })
        .gt(0, { message: "Must be a number greater than 0" })
        .max(MAX_AMOUNT, {
            message: `Must be ≤ ${MAX_AMOUNT.toLocaleString("en-US")}`,
        }),

    // Strings
    string: z.string(),
    stringMin1: z.string().min(1, { message: "Must be at least 1 character" }),
    stringToNumber: z.coerce
        .number()
        .finite({ message: "Must be a finite number" })
        .nonnegative({ message: "Must be a positive number" })
        .max(MAX_LINE_TOTAL, {
            message: `Must be ≤ ${MAX_LINE_TOTAL.toLocaleString("en-US")}`,
        }),

    // Charges
    stringToNumberWithMax: z.coerce
        .number()
        .finite({ message: "Must be a finite number" })
        .min(0, { message: "Must be a positive number" })
        .max(MAX_AMOUNT, {
            message: `Must be ≤ ${MAX_AMOUNT.toLocaleString("en-US")}`,
        }),

    stringOptional: z.string().optional(),

    nonNegativeNumber: z.coerce
        .number()
        .finite({ message: "Must be a finite number" })
        .nonnegative({ message: "Must be a positive number" })
        .max(MAX_LINE_TOTAL, {
            message: `Must be ≤ ${MAX_LINE_TOTAL.toLocaleString("en-US")}`,
        }),
};

const CustomInputSchema = z.object({
    key: boundedString(MAX_CUSTOM_FIELD, "Custom field name"),
    value: boundedString(MAX_CUSTOM_FIELD, "Custom field value"),
});

const InvoiceSenderSchema = z.object({
    name: fieldValidators.name,
    address: fieldValidators.address,
    zipCode: fieldValidators.zipCode,
    city: fieldValidators.city,
    country: fieldValidators.country,
    email: fieldValidators.email,
    phone: fieldValidators.phone,
    customInputs: z.array(CustomInputSchema).max(50).optional(),
});

const InvoiceReceiverSchema = z.object({
    name: fieldValidators.name,
    address: fieldValidators.address,
    zipCode: fieldValidators.zipCode,
    city: fieldValidators.city,
    country: fieldValidators.country,
    email: fieldValidators.email,
    phone: fieldValidators.phone,
    customInputs: z.array(CustomInputSchema).max(50).optional(),
});

const ItemSchema = z.object({
    name: boundedString(MAX_NAME, "Item name").min(1, {
        message: "Must be at least 1 character",
    }),
    description: boundedString(MAX_TEXT, "Description").optional(),
    quantity: fieldValidators.quantity,
    unitPrice: fieldValidators.unitPrice,
    total: fieldValidators.stringToNumber,
});

/**
 * Bank details are optional.
 *
 * The object was already `.optional()`, but each field inside it required at
 * least one character. Since the form always seeds `paymentInformation` with
 * three empty strings, an invoice without bank details could never be
 * submitted — the object existed, so the inner `min(1)` ran. Fields are now
 * allowed to be blank; the template hides the block when all three are empty.
 */
const PaymentInformationSchema = z.object({
    bankName: boundedString(MAX_NAME, "Bank name").optional(),
    accountName: boundedString(MAX_NAME, "Account name").optional(),
    accountNumber: boundedString(MAX_NAME, "Account number").optional(),
});

const DiscountDetailsSchema = z.object({
    amount: fieldValidators.stringToNumberWithMax,
    amountType: fieldValidators.string,
});

const TaxDetailsSchema = z.object({
    amount: fieldValidators.stringToNumberWithMax,
    taxID: boundedString(MAX_NAME, "Tax ID").optional(),
    amountType: fieldValidators.string,
});

const ShippingDetailsSchema = z.object({
    cost: fieldValidators.stringToNumberWithMax,
    costType: fieldValidators.string,
});

const SignatureSchema = z.object({
    data: fieldValidators.string,
    // Interpolated into a Google Fonts URL during PDF generation, so it is
    // restricted to the fonts the UI actually offers.
    fontFamily: z
        .enum(SIGNATURE_FONTS.map((font) => font.name) as [string, ...string[]])
        .optional(),
});

/**
 * Presentation options. Every field optional with a default so existing saved
 * invoices keep validating.
 */
const ThemeSchema = z.object({
    // Restricted to a hex literal: the value is interpolated into inline
    // styles in the templates, including in the PDF.
    accentColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, { message: "Must be a hex colour" })
        .optional(),
    fontId: z
        .enum(["outfit", "plexSans", "sourceSerif", "plexMono"])
        .optional(),
    // "spacious" is new; the two older values still validate, so invoices
    // saved before it existed keep loading.
    density: z.enum(["compact", "comfortable", "spacious"]).optional(),
});

const InvoiceDetailsSchema = z.object({
    theme: ThemeSchema.optional(),
    invoiceLogo: imageDataUrl.optional(),
    invoiceNumber: fieldValidators.stringMin1,
    invoiceDate: fieldValidators.date,
    dueDate: fieldValidators.date,
    purchaseOrderNumber: fieldValidators.stringOptional,
    currency: fieldValidators.string,
    language: fieldValidators.string,
    items: z.array(ItemSchema).max(1_000),
    paymentInformation: PaymentInformationSchema.optional(),
    taxDetails: TaxDetailsSchema.optional(),
    discountDetails: DiscountDetailsSchema.optional(),
    shippingDetails: ShippingDetailsSchema.optional(),
    subTotal: fieldValidators.nonNegativeNumber,
    totalAmount: fieldValidators.nonNegativeNumber,
    totalAmountInWords: boundedString(MAX_TEXT, "Total in words"),
    additionalNotes: boundedString(MAX_TEXT, "Additional notes").optional(),
    paymentTerms: boundedString(MAX_TEXT, "Payment terms").min(1, {
        message: "Must be at least 1 character",
    }),
    signature: SignatureSchema.optional(),
    updatedAt: fieldValidators.stringOptional,
    pdfTemplate: z.number().int().min(1).max(20),
    /*
     * Free-text bands above and below the invoice document. Optional so every
     * invoice saved before they existed still validates and renders exactly as
     * it did. See TemplateFrame for where they are drawn.
     */
    headerText: boundedString(MAX_TEXT, "Header").optional(),
    footerText: boundedString(MAX_TEXT, "Footer").optional(),
});

const InvoiceSchema = z.object({
    sender: InvoiceSenderSchema,
    receiver: InvoiceReceiverSchema,
    details: InvoiceDetailsSchema,
});

export { InvoiceSchema, ItemSchema };
