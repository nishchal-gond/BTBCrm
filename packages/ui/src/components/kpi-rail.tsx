"use client";

import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";

function KpiRail({
	label,
	columns = 3,
	className,
	children,
}: {
	label: string;
	columns?: 2 | 3 | 4;
	className?: string;
	children: ReactNode;
}) {
	const shape = {
		2: "sm:grid-cols-2 sm:divide-x sm:divide-y-0",
		3: "sm:grid-cols-2 sm:divide-x lg:grid-cols-3 lg:divide-y-0",
		4: "sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0",
	} as const;

	return (
		<section
			aria-label={label}
			className={cn(
				"grid grid-cols-1 divide-y divide-subtle rounded-lg border bg-card",
				shape[columns],
				className,
			)}
		>
			{children}
		</section>
	);
}

function KpiCell({
	label,
	note,
	onSelect,
	selected,
	selectLabel,
	children,
}: {
	label: string;
	note: string;
	onSelect?: () => void;
	selected?: boolean;
	selectLabel?: string;
	children: ReactNode;
}) {
	const body = (
		<>
			<span className="font-medium text-2xs text-muted-foreground uppercase tracking-label">
				{label}
			</span>
			{children}
			<span className="text-muted-foreground text-xs">{note}</span>
		</>
	);

	if (!onSelect) {
		return (
			<div className="flex min-w-0 flex-col gap-1 px-4 py-3">{body}</div>
		);
	}

	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={selectLabel ?? label}
			onClick={onSelect}
			className={cn(
				"relative flex min-w-0 cursor-pointer flex-col items-start gap-1 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] ease-out",
				"before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent before:opacity-0",
				selected
					? "bg-accent-muted before:opacity-100 hover:bg-accent-muted"
					: "hover:bg-hover",
			)}
		>
			{body}
		</button>
	);
}

function KpiValue({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"font-mono font-semibold text-lg tabular-nums lg:text-xl",
				className,
			)}
		>
			{children}
		</span>
	);
}

export { KpiCell, KpiRail, KpiValue };
