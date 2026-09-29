import { VERTICALS } from "@crm/db/access";
import { DEPOSIT_ENTRIES } from "@crm/db/deposit-ledger";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const trimmed = z.string().trim();

const optionalText = (max: number) =>
	trimmed
		.max(max)
		.nullable()
		.transform((value) => (value === null || value === "" ? null : value));

const person = z.object({ userId: z.string(), name: z.string() });

export const depositRowOutput = z.object({
	id: z.string(),
	clientRef: z.string(),
	clientName: z.string(),
	vertical: z.enum(VERTICALS),
	entryType: z.enum(DEPOSIT_ENTRIES),
	amount: z.string(),
	currency: z.string(),
	method: z.string().nullable(),
	reference: z.string().nullable(),
	note: z.string().nullable(),
	correctsId: z.string().nullable(),
	occurredAt: z.string(),
	recordedBy: person,
	verifiedBy: person.nullable(),
	verifiedAt: z.string().nullable(),
	canVerify: z.boolean(),
});

export type DepositRow = z.infer<typeof depositRowOutput>;

export const ledgerTotalsOutput = z.object({
	total: z.string(),
	verified: z.string(),
	pending: z.string(),
	currency: z.string(),
	paymentCount: z.number(),
	entryCount: z.number(),
	lastDepositAt: z.string().nullable(),
});

export const depositListInput = listInput.extend({
	vertical: z.enum(VERTICALS).default("ACADEMY"),
	entryType: z.array(z.string()).default([]),
	verified: z.array(z.string()).default([]),
	recordedBy: z.array(z.string()).default([]),
});

export type DepositListInput = z.infer<typeof depositListInput>;

export const depositListOutput = z.object({
	rows: z.array(depositRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	totals: ledgerTotalsOutput,
});

export const clientLedgerInput = z.object({
	clientRef: trimmed.min(1),
});

export const clientLedgerOutput = z.object({
	rows: z.array(depositRowOutput),
	totals: ledgerTotalsOutput,
	canRecord: z.boolean(),
	canCorrect: z.boolean(),
});

export const recordDepositInput = z.object({
	clientRef: trimmed.min(1),
	entryType: z.enum(DEPOSIT_ENTRIES).default("PAYMENT"),
	amount: trimmed.min(1).max(20),
	method: optionalText(40).default(null),
	reference: optionalText(80).default(null),
	note: optionalText(300).default(null),
	correctsId: z.string().min(1).nullable().default(null),
	occurredAt: z.iso.datetime(),
});

export type RecordDepositInput = z.infer<typeof recordDepositInput>;

export const verifyDepositInput = z.object({
	id: z.string().min(1),
});

export type VerifyDepositInput = z.infer<typeof verifyDepositInput>;

export const depositWorkspaceOutput = z.object({
	currency: z.string(),
	entryTypes: z.array(z.enum(DEPOSIT_ENTRIES)),
	canRecord: z.boolean(),
	canCorrect: z.boolean(),
	canVerify: z.boolean(),
});
