import { CAPABILITIES, STAFF_ROLES, VERTICALS } from "@crm/db/access";
import { isTimeZone } from "@crm/validation/time-zone";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const TEAM_KINDS = ["SALES", "MENTOR"] as const;

export const STAFF_STATUSES = ["active", "inactive", "all"] as const;

const teamSummary = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(TEAM_KINDS),
});

export const staffMemberOutput = z.object({
	userId: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	role: z.enum(STAFF_ROLES),
	verticals: z.array(z.enum(VERTICALS)),
	team: teamSummary.nullable(),
	timezone: z.string(),
	phone: z.string().nullable(),
	isActive: z.boolean(),
	isViewer: z.boolean(),
	joinedAt: z.string(),
});

export type StaffMember = z.infer<typeof staffMemberOutput>;

export const staffMeOutput = staffMemberOutput.extend({
	capabilities: z.array(z.enum(CAPABILITIES)),
});

export type StaffMe = z.infer<typeof staffMeOutput>;

export const setStaffVerticalsInput = z.object({
	userId: z.string().min(1),
	verticals: z
		.array(z.enum(VERTICALS))
		.min(1, "A person works in at least one business line.")
		.transform((values) => [...new Set(values)]),
});

export type SetStaffVerticalsInput = z.infer<typeof setStaffVerticalsInput>;

export const staffListInput = listInput.extend({
	role: z.array(z.string()).default([]),
	status: z.enum(STAFF_STATUSES).default("active"),
});

export type StaffListInput = z.infer<typeof staffListInput>;

export const staffListOutput = z.object({
	rows: z.array(staffMemberOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const setStaffRoleInput = z.object({
	userId: z.string().min(1),
	role: z.enum(STAFF_ROLES),
});

export type SetStaffRoleInput = z.infer<typeof setStaffRoleInput>;

export const setStaffActiveInput = z.object({
	userId: z.string().min(1),
	isActive: z.boolean(),
});

export type SetStaffActiveInput = z.infer<typeof setStaffActiveInput>;

export const assignTeamInput = z.object({
	userId: z.string().min(1),
	teamId: z.string().min(1).nullable(),
});

export type AssignTeamInput = z.infer<typeof assignTeamInput>;

export const updateMeInput = z.object({
	timezone: z
		.string()
		.trim()
		.refine(isTimeZone, "Use an IANA time zone, like Asia/Dubai."),
	phone: z.string().trim().max(40).nullable(),
});

export type UpdateMeInput = z.infer<typeof updateMeInput>;

export const teamOutput = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(TEAM_KINDS),
	isActive: z.boolean(),
	manager: z.object({ userId: z.string(), name: z.string() }).nullable(),
	memberCount: z.number(),
	createdAt: z.string(),
});

export type Team = z.infer<typeof teamOutput>;

export const teamListOutput = z.array(teamOutput);

export const createTeamInput = z.object({
	name: z.string().trim().min(1).max(80),
	kind: z.enum(TEAM_KINDS),
	managerId: z.string().min(1).nullable().default(null),
});

export type CreateTeamInput = z.infer<typeof createTeamInput>;

export const updateTeamInput = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1).max(80).optional(),
	managerId: z.string().min(1).nullable().optional(),
	isActive: z.boolean().optional(),
});

export type UpdateTeamInput = z.infer<typeof updateTeamInput>;
