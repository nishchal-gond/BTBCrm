"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	BUSINESS_LINE_PARAM,
	type BusinessLine,
	clampBusinessLine,
	DEFAULT_BUSINESS_LINE,
} from "@/lib/business-line";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

const CLEARED_ON_SWITCH = [
	SEARCH_PARAM.list.page,
	SEARCH_PARAM.list.fields,
	"status",
	"salesOwner",
	"mentorOwner",
	"view",
] as const;

export function useBusinessLine(
	allowed: readonly BusinessLine[] = [],
): [BusinessLine, (next: BusinessLine) => void] {
	const router = useRouter();
	const pathname = usePathname();
	const search = useSearchParams();

	const raw = search.get(BUSINESS_LINE_PARAM);

	const line = useMemo(
		() =>
			allowed.length > 0
				? clampBusinessLine(raw, allowed)
				: clampBusinessLine(raw, [DEFAULT_BUSINESS_LINE, "REAL_ESTATE"]),
		[raw, allowed],
	);

	const set = useCallback(
		(next: BusinessLine) => {
			const params = new URLSearchParams(search.toString());

			if (next === DEFAULT_BUSINESS_LINE) params.delete(BUSINESS_LINE_PARAM);
			else params.set(BUSINESS_LINE_PARAM, next);

			for (const key of CLEARED_ON_SWITCH) params.delete(key);

			const query = params.toString();

			router.push(query.length > 0 ? `${pathname}?${query}` : pathname);
		},
		[pathname, router, search],
	);

	return useMemo(() => [line, set], [line, set]);
}
