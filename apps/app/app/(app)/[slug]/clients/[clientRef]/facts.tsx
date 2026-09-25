import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import type { ReactNode } from "react";

export function Facts({ children }: { children: ReactNode }) {
	return (
		<dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
			{children}
		</dl>
	);
}

export function Fact({
	label,
	numeric = false,
	children,
}: {
	label: string;
	numeric?: boolean;
	children: ReactNode;
}) {
	const empty = children === null || children === undefined || children === "";

	return (
		<div className="flex flex-col gap-1">
			<dt className="font-medium text-2xs text-muted-foreground uppercase tracking-label">
				{label}
			</dt>
			<dd className={numeric ? "font-mono text-sm tabular-nums" : "text-sm"}>
				{empty ? <EmptyCellValue /> : children}
			</dd>
		</div>
	);
}
