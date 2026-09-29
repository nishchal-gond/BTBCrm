import { isTimeZone } from "./time-zone";

export type WallClock = { day: string; time: string };

const PARTS_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
	const cached = PARTS_CACHE.get(zone);
	if (cached) return cached;

	const made = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	PARTS_CACHE.set(zone, made);
	return made;
}

const LABEL_CACHE = new Map<string, Intl.DateTimeFormat>();

function labelFormatter(zone: string): Intl.DateTimeFormat {
	const cached = LABEL_CACHE.get(zone);
	if (cached) return cached;

	const made = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		timeZoneName: "short",
	});

	LABEL_CACHE.set(zone, made);
	return made;
}

function wallClockMillis(instant: Date, zone: string): number {
	const parts = Object.fromEntries(
		partsFormatter(zone)
			.formatToParts(instant)
			.map((part) => [part.type, part.value]),
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

export function wallClockIn(instant: Date, zone: string): WallClock {
	const millis = wallClockMillis(instant, zone);
	const shown = new Date(millis).toISOString();

	return { day: shown.slice(0, 10), time: shown.slice(11, 16) };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

type DayParts = {
	weekday: string;
	day: string;
	month: string;
	year: string;
};

function dayParts(wall: WallClock): DayParts {
	const midnight = new Date(`${wall.day}T00:00:00Z`);

	return {
		weekday: WEEKDAYS[midnight.getUTCDay()] ?? "",
		day: wall.day.slice(8, 10),
		month: MONTHS[midnight.getUTCMonth()] ?? "",
		year: wall.day.slice(0, 4),
	};
}

export function clockIn(instant: Date, zone: string): string {
	return wallClockIn(instant, zone).time;
}

export function shortMoment(instant: Date, zone: string): string {
	const wall = wallClockIn(instant, zone);
	const shown = dayParts(wall);

	return `${shown.weekday} ${shown.day} ${shown.month}, ${wall.time}`;
}

export function dayLabel(instant: Date, zone: string): string {
	const shown = dayParts(wallClockIn(instant, zone));

	return `${shown.weekday} ${shown.day} ${shown.month} ${shown.year}`;
}

export function instantFromWallClock(
	wall: WallClock,
	zone: string,
): Date | null {
	if (!isTimeZone(zone)) return null;

	const wanted = Date.parse(`${wall.day}T${wall.time}:00Z`);

	if (Number.isNaN(wanted)) return null;

	let instant = new Date(wanted);

	for (let pass = 0; pass < 3; pass += 1) {
		const drift = wanted - wallClockMillis(instant, zone);
		if (drift === 0) break;
		instant = new Date(instant.getTime() + drift);
	}

	return instant;
}

const NAMED_ZONES = {
	"Asia/Dubai": "GST",
	"Asia/Riyadh": "AST",
	"Asia/Singapore": "SGT",
	"Asia/Hong_Kong": "HKT",
} as const satisfies Record<string, string>;

export function zoneLabel(instant: Date, zone: string): string {
	if (!isTimeZone(zone)) return zone;

	if (zone in NAMED_ZONES) {
		return NAMED_ZONES[zone as keyof typeof NAMED_ZONES];
	}

	const part = labelFormatter(zone)
		.formatToParts(instant)
		.find((one) => one.type === "timeZoneName");

	return part?.value ?? zone;
}
