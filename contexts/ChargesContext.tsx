"use client";

import React, {
    SetStateAction,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

// RHF
import { useFormContext, useWatch } from "react-hook-form";

// Helpers
import { formatPriceToString } from "@/lib/helpers";
import {
    MAX_LINE_TOTAL,
    clampNumber,
    clampPercentage,
    toFiniteNumber,
} from "@/lib/safeNumber";

// Types
import { InvoiceType, ItemType } from "@/types";

const defaultChargesContext = {
    discountSwitch: false,
    setDiscountSwitch: (newValue: boolean) => {},
    taxSwitch: false,
    setTaxSwitch: (newValue: boolean) => {},
    shippingSwitch: false,
    setShippingSwitch: (newValue: boolean) => {},
    discountType: "amount",
    setDiscountType: (newValue: SetStateAction<string>) => {},
    taxType: "amount",
    setTaxType: (newValue: SetStateAction<string>) => {},
    shippingType: "amount",
    setShippingType: (newValue: SetStateAction<string>) => {},
    totalInWordsSwitch: true,
    setTotalInWordsSwitch: (newValue: boolean) => {},
    currency: "USD",
    subTotal: 0,
    totalAmount: 0,
    calculateTotal: () => {},
};

export const ChargesContext = createContext(defaultChargesContext);

export const useChargesContext = () => {
    return useContext(ChargesContext);
};

type ChargesContextProps = {
    children: React.ReactNode;
};

export const ChargesContextProvider = ({ children }: ChargesContextProps) => {
    const { control, setValue, getValues } = useFormContext<InvoiceType>();

    // Form Fields
    const itemsArray = useWatch({
        name: `details.items`,
        control,
    });

    const currency = useWatch({
        name: `details.currency`,
        control,
    });

    // Charges
    const charges = {
        discount: useWatch({ name: `details.discountDetails`, control }) || {
            amount: 0,
            amountType: "amount",
        },
        tax: useWatch({ name: `details.taxDetails`, control }) || {
            amount: 0,
            amountType: "amount",
        },
        shipping: useWatch({ name: `details.shippingDetails`, control }) || {
            cost: 0,
            costType: "amount",
        },
    };

    const { discount, tax, shipping } = charges;

    // Switch states. On/Off
    const [discountSwitch, setDiscountSwitch] = useState<boolean>(
        discount?.amount ? true : false
    );
    const [taxSwitch, setTaxSwitch] = useState<boolean>(
        tax?.amount ? true : false
    );
    const [shippingSwitch, setShippingSwitch] = useState<boolean>(
        shipping?.cost ? true : false
    );

    // ? Old approach of using totalInWords variable
    // totalInWords ? true : false
    const [totalInWordsSwitch, setTotalInWordsSwitch] = useState<boolean>(true);

    // Initial subtotal and total
    const [subTotal, setSubTotal] = useState<number>(0);
    const [totalAmount, setTotalAmount] = useState<number>(0);

    // Types for discount, tax, and shipping. Amount | Percentage
    const [discountType, setDiscountType] = useState("amount");
    const [taxType, setTaxType] = useState("amount");
    const [shippingType, setShippingType] = useState("amount");

    // When loading invoice, if received values, turn on the switches
    useEffect(() => {
        if (discount?.amount) {
            setDiscountSwitch(true);
        }

        if (tax?.amount) {
            setTaxSwitch(true);
        }

        if (shipping?.cost) {
            setShippingSwitch(true);
        }

        if (discount?.amountType == "amount") {
            setDiscountType("amount");
        } else {
            setDiscountType("percentage");
        }

        if (tax?.amountType == "amount") {
            setTaxType("amount");
        } else {
            setTaxType("percentage");
        }

        if (shipping?.costType == "amount") {
            setShippingType("amount");
        } else {
            setShippingType("percentage");
        }
    }, [discount?.amount, tax?.amount, shipping?.cost]);

    // Check switches, if off set values to zero
    useEffect(() => {
        if (!discountSwitch) {
            setValue("details.discountDetails.amount", 0);
        }

        if (!taxSwitch) {
            setValue("details.taxDetails.amount", 0);
        }

        if (!shippingSwitch) {
            setValue("details.shippingDetails.cost", 0);
        }
    }, [discountSwitch, taxSwitch, shippingSwitch]);

    /**
     * Calculates the subtotal, total, and the total amount in words on the invoice.
     */
    const calculateTotal = useCallback(() => {
        /*
         * Every value here started as user input. `Number()` on a pasted
         * "1e999" is Infinity and on "abc" is NaN; both used to flow straight
         * into `details.totalAmount`, `toFixed()` and the invoice renderer.
         *
         * `toFiniteNumber` collapses those to 0 and the caps keep the sum
         * inside the exactly-representable integer range, so a bad keystroke
         * can no longer crash the app — it simply contributes nothing until
         * the user corrects it.
         */
        const totalSum: number = itemsArray.reduce(
            (sum: number, item: ItemType) => sum + toFiniteNumber(item.total),
            0
        );

        const safeSubTotal = clampNumber(totalSum, 0, MAX_LINE_TOTAL);

        setValue("details.subTotal", safeSubTotal);
        setSubTotal(safeSubTotal);

        const discountAmount: number = toFiniteNumber(discount?.amount);
        const taxAmount: number = toFiniteNumber(tax?.amount);
        const shippingCost: number = toFiniteNumber(shipping?.cost);

        let discountAmountType: string = "amount";
        let taxAmountType: string = "amount";
        let shippingCostType: string = "amount";

        let total: number = safeSubTotal;

        if (discountAmount > 0) {
            if (discountType == "amount") {
                total -= clampNumber(discountAmount, 0, MAX_LINE_TOTAL);
                discountAmountType = "amount";
            } else {
                const percentage = clampPercentage(discountAmount);
                total -= total * (percentage / 100);
                discountAmountType = "percentage";
            }
            setValue("details.discountDetails.amount", discountAmount);
        }

        if (taxAmount > 0) {
            if (taxType == "amount") {
                total += clampNumber(taxAmount, 0, MAX_LINE_TOTAL);
                taxAmountType = "amount";
            } else {
                const percentage = clampPercentage(taxAmount);
                total += total * (percentage / 100);
                taxAmountType = "percentage";
            }
            setValue("details.taxDetails.amount", taxAmount);
        }

        if (shippingCost > 0) {
            if (shippingType == "amount") {
                total += clampNumber(shippingCost, 0, MAX_LINE_TOTAL);
                shippingCostType = "amount";
            } else {
                const percentage = clampPercentage(shippingCost);
                total += total * (percentage / 100);
                shippingCostType = "percentage";
            }
            setValue("details.shippingDetails.cost", shippingCost);
        }

        // A 100% discount, or an amount larger than the subtotal, used to leave
        // a negative "amount due". Zero is the floor for an invoice.
        const safeTotal = clampNumber(total, 0, MAX_LINE_TOTAL);

        setTotalAmount(safeTotal);

        setValue("details.discountDetails.amountType", discountAmountType);
        setValue("details.taxDetails.amountType", taxAmountType);
        setValue("details.shippingDetails.costType", shippingCostType);

        setValue("details.totalAmount", safeTotal);
        
        if (totalInWordsSwitch) {
            setValue(
                "details.totalAmountInWords",
                formatPriceToString(safeTotal, getValues("details.currency"))
            );
        } else {
            setValue("details.totalAmountInWords", "");
        }
        /*
         * These deps are deliberately the primitive amounts, not the
         * discount/tax/shipping objects.
         *
         * calculateTotal calls setValue on those same sub-objects, so useWatch
         * hands back a fresh object identity on every run. Depending on the
         * objects therefore re-memoises the callback, re-fires the effect
         * below, and loops until React throws "Maximum update depth exceeded".
         * The primitives only change when a value genuinely changes.
         */
    }, [
        itemsArray,
        discount?.amount,
        tax?.amount,
        shipping?.cost,
        discountType,
        taxType,
        shippingType,
        totalInWordsSwitch,
        // read via getValues inside, but a change must still recalculate
        currency,
        setValue,
        getValues,
    ]);

    // Calculate total when values change. calculateTotal is memoised on
    // exactly those values, so depending on its identity keeps this in step
    // rather than duplicating the dependency list in two places.
    useEffect(() => {
        calculateTotal();
    }, [calculateTotal]);


    /*
     * Memoised: this object was rebuilt on every render, so every consumer of
     * useChargesContext re-rendered on each keystroke anywhere in the form.
     * The setters from useState are already stable identities.
     */
    const contextValue = useMemo(
        () => ({
            discountSwitch,
            setDiscountSwitch,
            taxSwitch,
            setTaxSwitch,
            shippingSwitch,
            setShippingSwitch,
            discountType,
            setDiscountType,
            taxType,
            setTaxType,
            shippingType,
            setShippingType,
            totalInWordsSwitch,
            setTotalInWordsSwitch,
            currency,
            subTotal,
            totalAmount,
            calculateTotal,
        }),
        [
            discountSwitch,
            taxSwitch,
            shippingSwitch,
            discountType,
            taxType,
            shippingType,
            totalInWordsSwitch,
            currency,
            subTotal,
            totalAmount,
            calculateTotal,
        ]
    );

    return (
        <ChargesContext.Provider value={contextValue}>
            {children}
        </ChargesContext.Provider>
    );
};
