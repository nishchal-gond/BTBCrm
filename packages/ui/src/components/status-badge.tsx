import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const statusBadgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-medium text-2xs uppercase tracking-badge",
	{
		variants: {
			tone: {
				positive:
					"border-positive-border bg-positive-muted text-positive-on-muted",
				negative:
					"border-negative-border bg-negative-muted text-negative-on-muted",
				warning: "border-warning-border bg-warning-muted text-warning-on-muted",
				info: "border-info-border bg-info-muted text-info-on-muted",
				neutral: "border-border bg-muted text-muted-foreground",
			},
		},
		defaultVariants: {
			tone: "neutral",
		},
	},
);

export type StatusTone = NonNullable<
	VariantProps<typeof statusBadgeVariants>["tone"]
>;

function StatusBadge({
	className,
	tone,
	children,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusBadgeVariants>) {
	return (
		<span
			data-slot="status-badge"
			className={cn(statusBadgeVariants({ tone }), className)}
			{...props}
		>
			<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
			{children}
		</span>
	);
}

export { StatusBadge, statusBadgeVariants };
