import { parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import type { RouterOutputs } from "@/lib/trpc/types";

export type BusinessLine =
	RouterOutputs["clients"]["workspace"]["verticals"][number];

export const BUSINESS_LINES = [
	"ACADEMY",
	"REAL_ESTATE",
] as const satisfies readonly BusinessLine[];

export const DEFAULT_BUSINESS_LINE: BusinessLine = "ACADEMY";

export const BUSINESS_LINE_LABELS = {
	ACADEMY: "Trading Academy",
	REAL_ESTATE: "Real Estate",
} as const satisfies Record<BusinessLine, string>;

export const BUSINESS_LINE_SHORT = {
	ACADEMY: "Academy",
	REAL_ESTATE: "Real Estate",
} as const satisfies Record<BusinessLine, string>;

export const BUSINESS_LINE_PARAM = SEARCH_PARAM.workspace.line;

export const businessLineParser = parseAsStringLiteral(
	BUSINESS_LINES,
).withDefault(DEFAULT_BUSINESS_LINE);

export function isBusinessLine(value: string): value is BusinessLine {
	return (BUSINESS_LINES as readonly string[]).includes(value);
}

export function clampBusinessLine(
	wanted: string | null | undefined,
	allowed: readonly BusinessLine[],
): BusinessLine {
	const fallback = allowed[0] ?? DEFAULT_BUSINESS_LINE;

	if (!wanted || !isBusinessLine(wanted)) return fallback;

	return allowed.includes(wanted) ? wanted : fallback;
}

export function readBusinessLine(
	searchParams: Record<string, string | string[] | undefined>,
	allowed: readonly BusinessLine[],
): BusinessLine {
	const raw = searchParams[BUSINESS_LINE_PARAM];
	const wanted = Array.isArray(raw) ? raw[0] : raw;

	return clampBusinessLine(wanted, allowed);
}

export function isAcademyOnly(line: BusinessLine): boolean {
	return line === "ACADEMY";
}
