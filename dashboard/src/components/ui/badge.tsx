import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "bg-primary text-primary-foreground": variant === "default",
          "bg-muted text-muted-foreground": variant === "secondary",
          "bg-destructive text-white": variant === "destructive",
          "bg-success text-white": variant === "success",
          "bg-warning text-white": variant === "warning",
        },
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
