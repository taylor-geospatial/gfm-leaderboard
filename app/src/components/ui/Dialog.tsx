import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "right" | "center" }
>(({ className, children, side = "right", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 bg-card text-card-foreground shadow-pop",
        side === "right"
          ? "top-0 right-0 h-full w-[min(560px,100%)] border-l border-border data-[state=open]:animate-in"
          : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(640px,90%)] rounded-lg border border-border data-[state=open]:animate-in",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
