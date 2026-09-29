"use client";

import { isTimeZone } from "@crm/validation/time-zone";
import { useQuery } from "@tanstack/react-query";
import { COMPANY_TIME_ZONE } from "@/lib/company-time";
import { useTRPC } from "@/lib/trpc/client";

export function useViewerZone(): string {
	const trpc = useTRPC();
	const me = useQuery(trpc.staff.me.queryOptions());

	const wanted = me.data?.timezone;

	return wanted && isTimeZone(wanted) ? wanted : COMPANY_TIME_ZONE;
}
