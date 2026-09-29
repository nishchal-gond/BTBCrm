import type { DepositEntry } from "./generated/prisma/enums";

export const DEPOSIT_ENTRIES = [
	"PAYMENT",
	"REFUND",
	"ADJUSTMENT",
] as const satisfies readonly DepositEntry[];

export const LEDGER_CURRENCY = "AED";

const SCALE = 100;

const MAX_FILS = Number.MAX_SAFE_INTEGER;

export type Amount = { fils: number };

export function parseAmount(input: string): Amount | { because: string } {
	const text = input.trim();

	if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(text)) {
		return {
			because:
				"Write an amount as digits, with at most two decimal places, like 25000 or 1250.50.",
		};
	}

	const negative = text.startsWith("-");
	const [whole = "0", fraction = ""] = text.replace("-", "").split(".");
	const fils =
		Number(whole) * SCALE + Number(fraction.padEnd(2, "0").slice(0, 2));

	if (!Number.isSafeInteger(fils) || fils > MAX_FILS) {
		return { because: "That amount is larger than the ledger can hold." };
	}

	return { fils: negative ? -fils : fils };
}

export function isAmount(value: Amount | { because: string }): value is Amount {
	return "fils" in value;
}

export function formatFils(fils: number): string {
	const negative = fils < 0;
	const absolute = negative ? -fils : fils;
	const whole = Math.trunc(absolute / SCALE);
	const fraction = (absolute % SCALE).toString().padStart(2, "0");

	return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function toFils(decimal: string): number {
	const parsed = parseAmount(decimal);
	return isAmount(parsed) ? parsed.fils : 0;
}

export function judgeEntry(
	entryType: DepositEntry,
	fils: number,
	correctsId: string | null,
): { allowed: true } | { allowed: false; because: string } {
	if (fils === 0) {
		return {
			allowed: false,
			because: "A ledger entry of zero records nothing.",
		};
	}

	if (entryType === "PAYMENT" && fils < 0) {
		return {
			allowed: false,
			because:
				"You entered a negative amount. A payment is money in; record money out as a refund.",
		};
	}

	if (entryType === "REFUND" && fils > 0) {
		return {
			allowed: false,
			because:
				"You entered a positive amount. A refund is money out, so it must be negative.",
		};
	}

	if (entryType === "ADJUSTMENT" && correctsId === null) {
		return {
			allowed: false,
			because:
				"An adjustment says which entry it corrects. The ledger is never edited in place.",
		};
	}

	if (entryType !== "ADJUSTMENT" && correctsId !== null) {
		return {
			allowed: false,
			because: "Only an adjustment corrects an earlier entry.",
		};
	}

	return { allowed: true };
}

export type LedgerTotals = {
	total: string;
	verified: string;
	pending: string;
	paymentCount: number;
	entryCount: number;
};

export type LedgerSums = {
	total: string | null;
	verified: string | null;
	paymentCount: number;
	entryCount: number;
};

export const EMPTY_TOTALS: LedgerTotals = {
	total: "0.00",
	verified: "0.00",
	pending: "0.00",
	paymentCount: 0,
	entryCount: 0,
};

export function totalsFromSums(sums: LedgerSums): LedgerTotals {
	const total = toFils(sums.total ?? "0");
	const verified = toFils(sums.verified ?? "0");

	return {
		total: formatFils(total),
		verified: formatFils(verified),
		pending: formatFils(total - verified),
		paymentCount: sums.paymentCount,
		entryCount: sums.entryCount,
	};
}
