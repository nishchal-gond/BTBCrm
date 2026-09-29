"use client";

import Filter from "@carbon/icons-react/es/Filter";
import Money from "@carbon/icons-react/es/Money";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import type { DepositEntryType } from "@/components/crm/deposit-entry";
import { depositEntryLabel } from "@/components/crm/deposit-entry";

export function describeLedgerFilters(
	filters: Record<string, string[]>,
	search: string,
): string[] {
	const named: string[] = [];

	if (search.trim() !== "") named.push(`matching “${search.trim()}”`);

	const entries = filters.entryType ?? [];
	if (entries.length > 0) {
		named.push(
			entries
				.map((value) => depositEntryLabel(value as DepositEntryType))
				.join(" or "),
		);
	}

	const verified = filters.verified ?? [];
	if (verified.length > 0) {
		named.push(
			verified.includes("verified") ? "verified only" : "pending only",
		);
	}

	return named;
}

export function DepositsEmpty({
	filters,
	onClear,
}: {
	filters: string[];
	onClear: () => void;
}) {
	const filtered = filters.length > 0;

	return (
		<div className="flex max-w-[52ch] flex-col items-center gap-3 text-center">
			<Icon
				icon={filtered ? Filter : Money}
				className="size-6 text-muted-foreground"
			/>
			<p className="font-medium text-foreground text-sm">
				{filtered ? "Nothing matches this filter" : "No money recorded yet"}
			</p>
			<p className="text-muted-foreground text-sm">
				{filtered
					? `You are looking at entries ${filters.join(", ")}. Nothing on the ledger fits.`
					: "Entries appear here as soon as somebody records a payment against a client."}
			</p>
			{filtered ? (
				<Button variant="outline" size="sm" onClick={onClear}>
					Clear the filter
				</Button>
			) : null}
		</div>
	);
}
