import { VERTICALS } from "@crm/db/access";
import { CLIENT_STATUSES } from "@crm/db/client-lifecycle";
import { z } from "zod";

export const overviewInput = z.object({
	vertical: z.enum(VERTICALS).nullable().default(null),
});

export type OverviewInput = z.infer<typeof overviewInput>;

export const attentionKindOutput = z.enum([
	"unassigned",
	"stale",
	"noMentor",
	"unverified",
]);

export const overviewOutput = z.object({
	vertical: z.enum(VERTICALS),
	scope: z.enum(["company", "team", "own"]),
	pipeline: z.array(
		z.object({
			status: z.enum(CLIENT_STATUSES),
			count: z.number(),
		}),
	),
	openPipeline: z.number(),
	convertedThisMonth: z.number(),
	activeStudents: z.number(),
	money: z
		.object({
			currency: z.string(),
			thisMonth: z.string(),
			pending: z.string(),
			entryCount: z.number(),
		})
		.nullable(),
	attention: z.array(
		z.object({
			kind: attentionKindOutput,
			count: z.number(),
			label: z.string(),
			href: z.string().nullable(),
		}),
	),
	next: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			eventType: z.string(),
			startsAt: z.string(),
			endsAt: z.string(),
			timezone: z.string(),
			clientRef: z.string().nullable(),
			clientName: z.string().nullable(),
		}),
	),
	recent: z.array(
		z.object({
			id: z.string(),
			clientRef: z.string(),
			clientName: z.string(),
			fromStatus: z.enum(CLIENT_STATUSES).nullable(),
			toStatus: z.enum(CLIENT_STATUSES),
			changedBy: z.string().nullable(),
			changedAt: z.string(),
		}),
	),
});

export type Overview = z.infer<typeof overviewOutput>;
