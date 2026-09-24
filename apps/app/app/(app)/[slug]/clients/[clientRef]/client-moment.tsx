import { LocalDateTime } from "@/components/local-date-time";

const MOMENT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZoneName: "short",
};

export function ClientMoment({ date }: { date: string }) {
	return <LocalDateTime date={date} options={MOMENT} />;
}
