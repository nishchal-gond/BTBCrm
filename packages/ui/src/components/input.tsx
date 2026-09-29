import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-8 w-full min-w-0 rounded-md border border-input bg-surface-input px-2.5 py-1 text-sm transition-[color,background-color,border-color] duration-[var(--dur-fast)] ease-out file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-strong focus-visible:border-strong disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
