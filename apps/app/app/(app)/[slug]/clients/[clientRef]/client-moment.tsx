import { LocalDateTime } from "@/components/local-date-time";
import { COMPANY_TIME_LABEL, COMPANY_TIME_ZONE } from "@/lib/company-time";

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

const COMPANY_MOMENT: Intl.DateTimeFormatOptions = {
	timeZone: COMPANY_TIME_ZONE,
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
};

export function CompanyMoment({ date }: { date: string }) {
	return (
		<>
			<LocalDateTime date={date} options={COMPANY_MOMENT} />{" "}
			{COMPANY_TIME_LABEL}
		</>
	);
}
