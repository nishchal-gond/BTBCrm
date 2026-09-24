"use client";

import { KpiCell, KpiRail } from "@crm/ui/components/kpi-rail";
import { cn } from "@crm/ui/lib/utils";
import { Money } from "@/components/crm/money";

export type Totals = {
	total: string;
	verified: string;
	pending: string;
	currency: string;
	paymentCount: number;
	entryCount: number;
};

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
		<KpiRail label="Ledger totals" columns={3}>
			<KpiCell
				label="Total"
				note={
					compact
						? "Derived, never stored"
						: `Derived from ${totals.entryCount} ${totals.entryCount === 1 ? "entry" : "entries"}`
				}
				onSelect={onFilter ? () => onFilter([]) : undefined}
				selected={onFilter ? showing.length === 0 : undefined}
				selectLabel="Show every entry"
			>
				<Money
					amount={totals.total}
					currency={totals.currency}
					className={cn(size, "font-semibold")}
				/>
			</KpiCell>
			<KpiCell
				label="Verified"
				note="Checked against the bank"
				onSelect={onFilter ? () => toggle("verified") : undefined}
				selected={showing.includes("verified")}
				selectLabel="Show verified entries only"
			>
				<Money
					amount={totals.verified}
					currency={totals.currency}
					className={cn(size, "font-semibold")}
				/>
			</KpiCell>
			<KpiCell
				label="Pending"
				note="Recorded, not yet verified"
				onSelect={onFilter ? () => toggle("pending") : undefined}
				selected={showing.includes("pending")}
				selectLabel="Show pending entries only"
			>
				<Money
					amount={totals.pending}
					currency={totals.currency}
					className={cn(size, "font-semibold")}
				/>
			</KpiCell>
		</KpiRail>
	);
}
