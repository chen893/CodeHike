import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:opacity-90",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border-border text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:opacity-90",
        draft: "border-transparent bg-status-draft text-status-draft-foreground",
        done: "border-transparent bg-status-done text-status-done-foreground",
        failed: "border-transparent bg-status-failed text-status-failed-foreground",
        generating: "border-transparent bg-status-generating text-status-generating-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
