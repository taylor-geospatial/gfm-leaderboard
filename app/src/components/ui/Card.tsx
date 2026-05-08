import { cn } from "@/lib/utils";
import * as React from "react";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border bg-card text-card-foreground shadow-card", className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-5 pt-4 pb-2", className)} {...props} />
);
export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-[13px] font-semibold tracking-tight", className)} {...props} />
);
export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-xs text-muted-foreground mt-0.5", className)} {...props} />
);
export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-5 pb-4", className)} {...props} />
);
