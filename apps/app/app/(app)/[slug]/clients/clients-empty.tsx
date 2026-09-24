"use client";

import Filter from "@carbon/icons-react/es/Filter";
import UserFollow from "@carbon/icons-react/es/UserFollow";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import type { ClientStatus } from "@/components/crm/client-status";
import { clientStatusLabel } from "@/components/crm/client-status";
import { CLIENT_VIEW_COPY } from "./clients-search-params";

type ClientView = keyof typeof CLIENT_VIEW_COPY;

export type ActiveFilter = {
	id: string;
	label: string;
};

export function describeFilters(
	filters: Record<string, string[]>,
	search: string,
): ActiveFilter[] {
	const named: ActiveFilter[] = [];

	if (search.trim() !== "") {
		named.push({ id: "q", label: `matching “${search.trim()}”` });
	}

	const statuses = filters.status ?? [];
	if (statuses.length > 0) {
		named.push({
			id: "status",
			label: `the status ${statuses
				.map((value) => clientStatusLabel(value as ClientStatus))
				.join(" or ")}`,
		});
	}

	if ((filters.salesOwner ?? []).length > 0) {
		named.push({ id: "salesOwner", label: "a chosen sales owner" });
	}

	if ((filters.mentorOwner ?? []).length > 0) {
		named.push({ id: "mentorOwner", label: "a chosen mentor" });
	}

	return named;
}

export function ClientsEmpty({
	view,
	filters,
	onClear,
}: {
	view: ClientView;
	filters: ActiveFilter[];
	onClear: () => void;
}) {
	const filtered = filters.length > 0;

	return (
		<div className="flex max-w-[52ch] flex-col items-center gap-3 text-center">
			<Icon
				icon={filtered ? Filter : UserFollow}
				className="size-6 text-muted-foreground"
			/>
			<p className="font-medium text-foreground text-sm">
				{filtered
					? "Nothing matches this filter"
					: CLIENT_VIEW_COPY[view].empty}
			</p>
			<p className="text-muted-foreground text-sm">
				{filtered
					? `You are looking at ${filters.map((filter) => filter.label).join(", ")}. Nothing on your book fits.`
					: "New people appear here as soon as somebody enters them."}
			</p>
			{filtered ? (
				<Button variant="outline" size="sm" onClick={onClear}>
					Clear the filter
				</Button>
			) : null}
		</div>
	);
}
