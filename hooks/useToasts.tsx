// ShadCn
import { toast } from "@/components/ui/use-toast";

const useToasts = () => {
    /*
     * One address book per side of the invoice, so the toast has to say which
     * one it means — "Client saved" after saving your own company reads as a
     * bug report.
     */
    const partyNoun = (kind: "sender" | "receiver") =>
        kind === "sender" ? "Sender" : "Client";

    const partySaved = (kind: "sender" | "receiver", name: string) => {
        toast({
            variant: "default",
            title: `${partyNoun(kind)} saved`,
            description: `${name} is now in your address book.`,
        });
    };

    const partyRemoved = (kind: "sender" | "receiver", name: string) => {
        toast({
            variant: "default",
            title: `${partyNoun(kind)} removed`,
            description: `${name} is no longer in your address book.`,
        });
    };

    const newInvoiceSuccess = () => {
        toast({
            variant: "default",
            title: "Generated new invoice",
            description: "Successfully created a new invoice",
        });
    };

    /*
     * The two quick actions at the top of the form replace everything the user
     * has typed, so both say plainly what just happened to their work — a
     * silent change of that size is the kind of thing people only notice after
     * they have lost something.
     */
    const formFilledWithSample = () => {
        toast({
            variant: "default",
            title: "Sample invoice filled in",
            description:
                "Every field now holds example data. Edit anything you like — nothing has been saved over your invoices.",
        });
    };

    const formCleared = () => {
        toast({
            variant: "default",
            title: "Form cleared",
            description:
                "All fields are back to their defaults and the saved draft has been removed.",
        });
    };

    const saveInvoiceSuccess = () => {
        toast({
            variant: "default",
            title: "Saved Invoice",
            description: "Your invoice details are saved now",
        });
    };

    const modifiedInvoiceSuccess = () => {
        toast({
            variant: "default",
            title: "Modified Invoice",
            description: "Successfully modified your invoice",
        });
    };

    /**
     * Surfaced when RHF rejects a submit. Without this the failure was silent
     * apart from a console.log, and on mobile the invalid field is usually on
     * a wizard step that is not currently visible.
     *
     * `description` lets the server explain an e-invoice refusal (missing VAT
     * ID, unknown country, …) instead of the generic message.
     */
    const exportInvoiceError = (description?: string) => {
        toast({
            variant: "destructive",
            title: "Could not export the invoice",
            description:
                description || "Something went wrong. Try again in a moment.",
        });
    };

    const printInvoiceError = () => {
        toast({
            variant: "destructive",
            title: "Could not prepare the invoice for printing",
            description:
                "Your invoice was not changed. Try again, or use your browser's own Print command.",
        });
    };

    const formValidationError = () => {
        toast({
            variant: "destructive",
            title: "Please check the form",
            description:
                "Some required fields are missing or invalid. Steps with errors are marked in the progress bar.",
        });
    };

    const importInvoiceError = () => {
        toast({
            variant: "destructive",
            title: "Error",
            description:
                "Something went importing the invoice. Make sure the file is a valid FatahTech Invoice JSON export",
        });
    };

    return {
        partySaved,
        partyRemoved,
        newInvoiceSuccess,
        formFilledWithSample,
        formCleared,
        saveInvoiceSuccess,
        modifiedInvoiceSuccess,
        printInvoiceError,
        exportInvoiceError,
        formValidationError,
        importInvoiceError,
    };
};

export default useToasts;
