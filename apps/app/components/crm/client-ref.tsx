"use client";

import Copy from "@carbon/icons-react/es/Copy";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import { toast } from "sonner";

export function ClientRef({
	value,
	className,
}: {
	value: string;
	className?: string;
}) {
	return (
		<button
			type="button"
			data-slot="client-ref"
			aria-label={`Copy client reference ${value}`}
			className={cn(
				"group/ref inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-sm font-mono text-foreground text-sm tabular-nums",
				className,
			)}
			onClick={(event) => {
				event.stopPropagation();
				navigator.clipboard
					.writeText(value)
					.then(() => toast.success(`${value} copied.`))
					.catch(() => toast.error("Your browser would not let us copy that."));
			}}
		>
			{value}
			<Icon
				icon={Copy}
				className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/ref:opacity-100 group-focus-visible/ref:opacity-100"
			/>
		</button>
	);
}
