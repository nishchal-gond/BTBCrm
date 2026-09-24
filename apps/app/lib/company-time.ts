export const COMPANY_TIME_ZONE = "Asia/Dubai";

const DAY = new Intl.DateTimeFormat("en-CA", {
	timeZone: COMPANY_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const WALL = new Intl.DateTimeFormat("en-US", {
	timeZone: COMPANY_TIME_ZONE,
	hour12: false,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
});

export function todayInCompanyZone(now: Date = new Date()): string {
	return DAY.format(now);
}

function wallClockOf(instant: Date): number {
	const parts = Object.fromEntries(
		WALL.formatToParts(instant).map((part) => [part.type, part.value]),
	);

	return Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour) % 24,
		Number(parts.minute),
		Number(parts.second),
	);
}

export function instantForCompanyDay(
	day: string,
	now: Date = new Date(),
): string {
	return day === todayInCompanyZone(now)
		? now.toISOString()
		: middayInCompanyZone(day);
}

export function middayInCompanyZone(day: string): string {
	const wanted = Date.parse(`${day}T12:00:00Z`);

	let instant = new Date(wanted);
	for (let pass = 0; pass < 2; pass += 1) {
		instant = new Date(instant.getTime() + (wanted - wallClockOf(instant)));
	}

	return instant.toISOString();
}
