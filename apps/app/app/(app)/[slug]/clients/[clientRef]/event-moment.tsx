"use client";

import { clockIn, dayLabel, zoneLabel } from "@crm/validation/zoned-time";
import { useViewerZone } from "@/lib/use-viewer-zone";

export function EventMoment({
	startsAt,
	endsAt,
	timezone,
	isAllDay,
}: {
	startsAt: string;
	endsAt: string;
	timezone: string;
	isAllDay: boolean;
}) {
	const zone = useViewerZone();
	const start = new Date(startsAt);
	const end = new Date(endsAt);

	const day = dayLabel(start, zone);
	const mine = zoneLabel(start, zone);

	if (isAllDay) {
		return (
			<span className="font-mono text-sm tabular-nums">{day} · all day</span>
		);
	}

	const window = `${clockIn(start, zone)}–${clockIn(end, zone)}`;
	const elsewhere =
		timezone === zone
			? null
			: `${clockIn(start, timezone)} ${zoneLabel(start, timezone)}`;

	return (
		<span className="font-mono text-sm tabular-nums">
			{day} · {window} {mine}
			{elsewhere ? (
				<span className="text-muted-foreground"> ({elsewhere})</span>
			) : null}
		</span>
	);
}
