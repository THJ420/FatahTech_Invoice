import React, { createContext, useContext } from "react";

// Next Intl
import { useTranslations } from "next-intl";

type Translate = (
    key: string,
    values?: Record<string, string | number | Date>
) => string;

const defaultTranslationContext: { _t: Translate } = {
    _t: (key: string) => "",
};

export const TranslationContext = createContext(defaultTranslationContext);

// `useTranslation` was an identical second export of this hook, unused
// anywhere in the app.
export const useTranslationContext = () => {
    return useContext(TranslationContext);
};

type TranslationProviderProps = {
    children: React.ReactNode;
};

export const TranslationProvider = ({ children }: TranslationProviderProps) => {
    const _t = useTranslations();

    return (
        <TranslationContext.Provider value={{ _t }}>
            {children}
        </TranslationContext.Provider>
    );
};
