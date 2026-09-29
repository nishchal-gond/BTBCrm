"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(notify: () => void) => {
			const list = window.matchMedia(query);
			list.addEventListener("change", notify);

			return () => list.removeEventListener("change", notify);
		},
		[query],
	);

	const read = useCallback(() => window.matchMedia(query).matches, [query]);

	return useSyncExternalStore(subscribe, read, () => false);
}

export const COMPACT_TABLE_QUERY = "(max-width: 1023px)";

export function useCompactTable(): boolean {
	return useMediaQuery(COMPACT_TABLE_QUERY);
}
