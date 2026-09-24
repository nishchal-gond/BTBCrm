"use client";

import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";
import { Money } from "@/components/crm/money";

export type Totals = {
	total: string;
	verified: string;
	pending: string;
	currency: string;
	paymentCount: number;
	entryCount: number;
};

function Cell({
	label,
	note,
	onSelect,
	selected,
	children,
}: {
	label: string;
	note: string;
	onSelect?: () => void;
	selected?: boolean;
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
		return <div className="flex flex-col gap-1 px-4 py-3">{body}</div>;
	}

	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onSelect}
			className={cn(
				"flex flex-col items-start gap-1 px-4 py-3 text-left transition-colors duration-[var(--dur-fast)] ease-out hover:bg-hover",
				selected && "bg-accent-muted",
			)}
		>
			{body}
		</button>
	);
}

export function LedgerTotals({
	totals,
	filter,
	onFilter,
	compact = false,
}: {
	totals: Totals;
	filter?: string[];
	onFilter?: (next: string[]) => void;
	compact?: boolean;
}) {
	const size = compact ? "text-lg" : "text-lg lg:text-xl";
	const showing = filter ?? [];

	const toggle = (value: string) => {
		if (!onFilter) return;
		onFilter(showing.includes(value) ? [] : [value]);
	};

	return (
		<section
			aria-label="Ledger totals"
			className="grid grid-cols-1 divide-y divide-subtle rounded-lg border bg-card lg:grid-cols-3 lg:divide-x lg:divide-y-0"
		>
			<Cell
				label="Total"
				note={`Derived from ${totals.entryCount} ${totals.entryCount === 1 ? "entry" : "entries"}`}
				onSelect={onFilter ? () => onFilter([]) : undefined}
				selected={onFilter ? showing.length === 0 : undefined}
			>
				<Money
					amount={totals.total}
					currency={totals.currency}
					className={cn(size, "font-semibold")}
				/>
			</Cell>
			<Cell
				label="Verified"
				note="Checked against the bank"
				onSelect={onFilter ? () => toggle("verified") : undefined}
				selected={showing.includes("verified")}
			>
				<Money
					amount={totals.verified}
					currency={totals.currency}
					className={cn(size, "font-semibold")}
				/>
			</Cell>
			<Cell
				label="Pending"
				note="Recorded, not yet verified"
				onSelect={onFilter ? () => toggle("pending") : undefined}
				selected={showing.includes("pending")}
			>
				<Money
					amount={totals.pending}
					currency={totals.currency}
					className={cn(size, "font-semibold")}
				/>
			</Cell>
		</section>
	);
}
