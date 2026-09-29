"use client";

import Education from "@carbon/icons-react/es/Education";
import Filter from "@carbon/icons-react/es/Filter";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";

export function ProgramsEmpty({
	status,
	search,
	onClear,
}: {
	status: string;
	search: string;
	onClear: () => void;
}) {
	const filtered = search.trim() !== "";

	if (filtered) {
		return (
			<div className="flex max-w-[52ch] flex-col items-center gap-3 text-center">
				<Icon icon={Filter} className="size-6 text-muted-foreground" />
				<p className="font-medium text-foreground text-sm">
					Nothing matches this filter
				</p>
				<p className="text-muted-foreground text-sm">
					You are looking at programmes matching “{search.trim()}”
					{status === "retired" ? " that are retired" : ""}. None fits.
				</p>
				<Button variant="outline" size="sm" onClick={onClear}>
					Clear the filter
				</Button>
			</div>
		);
	}

	return (
		<div className="flex max-w-[52ch] flex-col items-center gap-3 text-center">
			<Icon icon={Education} className="size-6 text-muted-foreground" />
			<p className="font-medium text-foreground text-sm">No programmes here</p>
			<p className="text-muted-foreground text-sm">
				{status === "retired"
					? "Nothing has been retired yet."
					: "A programme is what a student enrols on. An administrator defines them."}
			</p>
		</div>
	);
}
