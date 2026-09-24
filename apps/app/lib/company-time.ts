import { instantFromWallClock, wallClockIn } from "@crm/validation/zoned-time";

export const COMPANY_TIME_ZONE = "Asia/Dubai";

export function todayInZone(zone: string, now: Date = new Date()): string {
	return wallClockIn(now, zone).day;
}

export function middayInZone(day: string, zone: string): string {
	const instant = instantFromWallClock({ day, time: "12:00" }, zone);

	return (instant ?? new Date()).toISOString();
}

export function instantForDay(
	day: string,
	zone: string,
	now: Date = new Date(),
): string {
	return day === todayInZone(zone, now)
		? now.toISOString()
		: middayInZone(day, zone);
}
