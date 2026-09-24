import { describe, expect, it } from "bun:test";
import {
	formatFils,
	isAmount,
	judgeEntry,
	parseAmount,
	totalsFrom,
} from "../src/deposit-ledger";

function fils(input: string): number {
	const parsed = parseAmount(input);
	if (!isAmount(parsed)) throw new Error(parsed.because);
	return parsed.fils;
}

describe("reading an amount", () => {
	it("keeps two decimal places exactly", () => {
		expect(fils("25000")).toBe(2_500_000);
		expect(fils("1250.50")).toBe(125_050);
		expect(fils("0.01")).toBe(1);
		expect(fils("-750.25")).toBe(-75_025);
	});

	it("does not lose a fil to floating point", () => {
		const sum = fils("0.10") + fils("0.20");
		expect(formatFils(sum)).toBe("0.30");
	});

	it("refuses anything that is not an amount", () => {
		for (const bad of ["", "abc", "1.234", "1,000", "1e5", " 12 34 "]) {
			expect(isAmount(parseAmount(bad))).toBe(false);
		}
	});

	it("round-trips through the formatter", () => {
		for (const text of ["0.00", "1.05", "25000.00", "-99.99"]) {
			expect(formatFils(fils(text))).toBe(text);
		}
	});
});

describe("what a ledger entry may be", () => {
	it("refuses an entry of nothing", () => {
		expect(judgeEntry("PAYMENT", 0, null)).toMatchObject({ allowed: false });
	});

	it("keeps a payment positive and a refund negative", () => {
		expect(judgeEntry("PAYMENT", 100, null)).toEqual({ allowed: true });
		expect(judgeEntry("PAYMENT", -100, null)).toMatchObject({
			allowed: false,
		});
		expect(judgeEntry("REFUND", -100, null)).toEqual({ allowed: true });
		expect(judgeEntry("REFUND", 100, null)).toMatchObject({ allowed: false });
	});

	it("asks an adjustment which entry it corrects", () => {
		expect(judgeEntry("ADJUSTMENT", 100, null)).toMatchObject({
			allowed: false,
		});
		expect(judgeEntry("ADJUSTMENT", 100, "dep_1")).toEqual({ allowed: true });
		expect(judgeEntry("ADJUSTMENT", -100, "dep_1")).toEqual({ allowed: true });
	});

	it("does not let a payment claim to correct anything", () => {
		expect(judgeEntry("PAYMENT", 100, "dep_1")).toMatchObject({
			allowed: false,
		});
	});
});

describe("totals derived from the lines", () => {
	const at = new Date("2026-09-01T00:00:00.000Z");

	it("is zero for an empty ledger", () => {
		expect(totalsFrom([])).toEqual({
			total: "0.00",
			verified: "0.00",
			pending: "0.00",
			paymentCount: 0,
			entryCount: 0,
		});
	});

	it("splits verified money from money still pending", () => {
		expect(
			totalsFrom([
				{ amount: "25000.00", entryType: "PAYMENT", verifiedAt: at },
				{ amount: "5000.00", entryType: "PAYMENT", verifiedAt: null },
				{ amount: "-1000.00", entryType: "REFUND", verifiedAt: at },
			]),
		).toEqual({
			total: "29000.00",
			verified: "24000.00",
			pending: "5000.00",
			paymentCount: 2,
			entryCount: 3,
		});
	});

	it("lets an adjustment pull a total back down", () => {
		expect(
			totalsFrom([
				{ amount: "1000.00", entryType: "PAYMENT", verifiedAt: null },
				{ amount: "-250.50", entryType: "ADJUSTMENT", verifiedAt: null },
			]).total,
		).toBe("749.50");
	});

	it("counts payments, not every entry", () => {
		const totals = totalsFrom([
			{ amount: "10.00", entryType: "PAYMENT", verifiedAt: null },
			{ amount: "-10.00", entryType: "REFUND", verifiedAt: null },
			{ amount: "1.00", entryType: "ADJUSTMENT", verifiedAt: null },
		]);

		expect(totals.paymentCount).toBe(1);
		expect(totals.entryCount).toBe(3);
		expect(totals.total).toBe("1.00");
	});
});
