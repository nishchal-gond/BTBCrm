"use client";

import { zoneLabel } from "@crm/validation/zoned-time";
import { LocalDateTime } from "@/components/local-date-time";
import { useViewerZone } from "@/lib/use-viewer-zone";

const MOMENT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
};

export function ClientMoment({ date }: { date: string }) {
	const zone = useViewerZone();

	return (
		<>
			<LocalDateTime date={date} options={{ ...MOMENT, timeZone: zone }} />{" "}
			<span className="text-muted-foreground">
				{zoneLabel(new Date(date), zone)}
			</span>
		</>
	);
}

export function CompanyMoment({ date }: { date: string }) {
	return <ClientMoment date={date} />;
}
