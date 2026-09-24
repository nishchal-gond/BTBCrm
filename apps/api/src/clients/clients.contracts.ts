import { VERTICALS } from "@crm/db/access";
import { CLIENT_STATUSES, CLIENT_VIEWS } from "@crm/db/client-lifecycle";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const trimmed = z.string().trim();

const optionalText = (max: number) =>
	trimmed
		.max(max)
		.nullable()
		.transform((value) => (value === null || value === "" ? null : value));

export const clientVerticalInput = z.enum(VERTICALS).default("ACADEMY");

export const ownerSummary = z.object({
	userId: z.string(),
	name: z.string(),
});

export const clientRowOutput = z.object({
	id: z.string(),
	clientRef: z.string(),
	vertical: z.enum(VERTICALS),
	name: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	country: z.string().nullable(),
	city: z.string().nullable(),
	status: z.enum(CLIENT_STATUSES),
	source: z.string().nullable(),
	salesOwner: ownerSummary.nullable(),
	mentorOwner: ownerSummary.nullable(),
	createdAt: z.string(),
	lastActivityAt: z.string().nullable(),
});

export type ClientRow = z.infer<typeof clientRowOutput>;

export const clientDetailOutput = clientRowOutput.extend({
	createdBy: ownerSummary.nullable(),
	convertedBy: ownerSummary.nullable(),
	convertedAt: z.string().nullable(),
	updatedAt: z.string(),
	canEdit: z.boolean(),
	canSeeMoney: z.boolean(),
});

export type ClientDetail = z.infer<typeof clientDetailOutput>;

export const clientListInput = listInput.extend({
	vertical: clientVerticalInput,
	view: z.enum(CLIENT_VIEWS).default("clients"),
	status: z.array(z.string()).default([]),
	salesOwner: z.array(z.string()).default([]),
	mentorOwner: z.array(z.string()).default([]),
	source: z.array(z.string()).default([]),
});

export type ClientListInput = z.infer<typeof clientListInput>;

export const clientListOutput = z.object({
	rows: z.array(clientRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const clientRefInput = z.object({
	clientRef: z.string().trim().min(1),
});

export type ClientRefInput = z.infer<typeof clientRefInput>;

export const createClientInput = z.object({
	vertical: clientVerticalInput,
	firstName: trimmed.min(1).max(80),
	lastName: trimmed.min(1).max(80),
	email: z.email().nullable().default(null),
	phone: optionalText(40).default(null),
	country: trimmed
		.length(2)
		.regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code, like AE.")
		.nullable()
		.default(null),
	city: optionalText(80).default(null),
	source: optionalText(80).default(null),
	salesOwnerId: z.string().min(1).nullable().default(null),
});

export type CreateClientInput = z.infer<typeof createClientInput>;

export const updateClientInput = clientRefInput.extend({
	firstName: trimmed.min(1).max(80).optional(),
	lastName: trimmed.min(1).max(80).optional(),
	email: z.email().nullable().optional(),
	phone: optionalText(40).optional(),
	country: trimmed
		.length(2)
		.regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code, like AE.")
		.nullable()
		.optional(),
	city: optionalText(80).optional(),
	source: optionalText(80).optional(),
});

export type UpdateClientInput = z.infer<typeof updateClientInput>;

export const assignOwnerInput = clientRefInput.extend({
	userId: z.string().min(1).nullable(),
});

export type AssignOwnerInput = z.infer<typeof assignOwnerInput>;

export const setStatusInput = clientRefInput.extend({
	status: z.enum(CLIENT_STATUSES),
	reason: optionalText(300).default(null),
});

export type SetStatusInput = z.infer<typeof setStatusInput>;

export const convertClientInput = clientRefInput.extend({
	mentorId: z.string().min(1).nullable().default(null),
});

export type ConvertClientInput = z.infer<typeof convertClientInput>;

export const statusHistoryOutput = z.array(
	z.object({
		id: z.string(),
		fromStatus: z.enum(CLIENT_STATUSES).nullable(),
		toStatus: z.enum(CLIENT_STATUSES),
		reason: z.string().nullable(),
		changedBy: ownerSummary.nullable(),
		changedAt: z.string(),
	}),
);

export const duplicateCheckInput = z.object({
	email: z.email().nullable().default(null),
	phone: optionalText(40).default(null),
});

export type DuplicateCheckInput = z.infer<typeof duplicateCheckInput>;

export const duplicateCheckOutput = z.object({
	exists: z.boolean(),
	match: z
		.object({
			clientRef: z.string(),
			name: z.string(),
			status: z.enum(CLIENT_STATUSES),
			vertical: z.enum(VERTICALS),
			salesOwner: ownerSummary.nullable(),
		})
		.nullable(),
});

export const clientWorkspaceOutput = z.object({
	verticals: z.array(z.enum(VERTICALS)),
	views: z.array(z.enum(CLIENT_VIEWS)),
	statuses: z.array(z.enum(CLIENT_STATUSES)),
});
