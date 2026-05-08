import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium tracking-tight",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        accent: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
        outline: "border border-border text-muted-foreground",
        solid: "bg-foreground text-background",
        success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
);
