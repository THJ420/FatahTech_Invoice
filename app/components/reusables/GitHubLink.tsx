"use client";

// ShadCn
import { Button } from "@/components/ui/button";

// Contexts
import { useTranslationContext } from "@/contexts/TranslationContext";

// Utils
import { cn } from "@/lib/utils";

// Icons
import { Github } from "lucide-react";

/** The public repository. One constant, so the two entry points cannot drift. */
export const GITHUB_REPO_URL =
    "https://github.com/THJ420/FatahTech_Invoice";

type GitHubLinkProps = {
    /**
     * `icon` is the navbar control; `block` is the full-width row used in the
     * mobile settings sheet, where there is no room for another icon.
     */
    variant?: "icon" | "block";
    className?: string;
};

/**
 * Link to the source repository.
 *
 * An anchor rather than a button — it navigates, so it should be middle-clickable
 * and readable as a link. `Button asChild` gives it the ghost icon button's
 * styling and focus ring without changing the element or its semantics.
 */
const GitHubLink = ({ variant = "icon", className }: GitHubLinkProps) => {
    const { _t } = useTranslationContext();

    return (
        <Button
            asChild
            variant="ghost"
            size={variant === "icon" ? "icon" : "default"}
            className={cn(
                "flex items-center gap-2",
                variant === "block" && "w-full justify-start",
                className
            )}
        >
            {/*
             * `noopener` stops the new tab from reaching back through
             * `window.opener`; `noreferrer` keeps the referrer off the request.
             */}
            <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={_t("navbar.github")}
            >
                <Github className="h-5 w-5" />
                {variant === "block" && (
                    <span>{_t("navbar.githubLabel")}</span>
                )}
            </a>
        </Button>
    );
};

export default GitHubLink;
