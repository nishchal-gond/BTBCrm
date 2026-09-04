export const DEFAULT_TIME_ZONE = "Asia/Dubai";

export function isTimeZone(value: string): boolean {
	if (value.trim() !== value || value.length === 0) return false;

	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}
