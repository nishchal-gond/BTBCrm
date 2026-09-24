import { ENROLLMENT_STATUSES } from "@crm/db/enrollment";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const trimmed = z.string().trim();

const optionalText = (max: number) =>
	trimmed
		.max(max)
		.nullable()
		.transform((value) => (value === null || value === "" ? null : value));

const person = z.object({ userId: z.string(), name: z.string() });

export const programOutput = z.object({
	id: z.string(),
	code: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	durationWeeks: z.number(),
	priceAed: z.string(),
	isActive: z.boolean(),
	activeEnrollments: z.number(),
	totalEnrollments: z.number(),
	createdAt: z.string(),
});

export type Program = z.infer<typeof programOutput>;

export const programListInput = listInput.extend({
	status: z.enum(["active", "retired", "all"]).default("active"),
});

export type ProgramListInput = z.infer<typeof programListInput>;

export const programListOutput = z.object({
	rows: z.array(programOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const programOptionsOutput = z.array(
	z.object({
		id: z.string(),
		code: z.string(),
		name: z.string(),
		durationWeeks: z.number(),
		priceAed: z.string(),
	}),
);

export const createProgramInput = z.object({
	code: trimmed
		.min(2)
		.max(20)
		.regex(
			/^[A-Z0-9-]+$/,
			"A programme code is capitals, digits and hyphens, like FX-FOUNDATION.",
		),
	name: trimmed.min(1).max(120),
	description: optionalText(600).default(null),
	durationWeeks: z.number().int().min(1).max(260),
	priceAed: trimmed.min(1).max(20),
});

export type CreateProgramInput = z.infer<typeof createProgramInput>;

export const updateProgramInput = z.object({
	id: z.string().min(1),
	name: trimmed.min(1).max(120).optional(),
	description: optionalText(600).optional(),
	durationWeeks: z.number().int().min(1).max(260).optional(),
	priceAed: trimmed.min(1).max(20).optional(),
	isActive: z.boolean().optional(),
});

export type UpdateProgramInput = z.infer<typeof updateProgramInput>;

export const enrollmentOutput = z.object({
	id: z.string(),
	clientRef: z.string(),
	clientName: z.string(),
	program: z.object({
		id: z.string(),
		code: z.string(),
		name: z.string(),
		durationWeeks: z.number(),
	}),
	mentor: person.nullable(),
	cohort: z.string().nullable(),
	status: z.enum(ENROLLMENT_STATUSES),
	enrolledAt: z.string(),
	completedAt: z.string().nullable(),
	notes: z.string().nullable(),
	createdBy: person.nullable(),
	weeksElapsed: z.number(),
	progressPercent: z.number(),
	canManage: z.boolean(),
});

export type Enrollment = z.infer<typeof enrollmentOutput>;

export const clientEnrollmentsOutput = z.object({
	rows: z.array(enrollmentOutput),
	active: enrollmentOutput.nullable(),
	canEnroll: z.boolean(),
});

export const enrollInput = z.object({
	clientRef: trimmed.min(1),
	programId: z.string().min(1),
	mentorId: z.string().min(1).nullable().default(null),
	cohort: optionalText(60).default(null),
	notes: optionalText(600).default(null),
});

export type EnrollInput = z.infer<typeof enrollInput>;

export const moveEnrollmentInput = z.object({
	id: z.string().min(1),
	status: z.enum(ENROLLMENT_STATUSES),
	notes: optionalText(600).default(null),
});

export type MoveEnrollmentInput = z.infer<typeof moveEnrollmentInput>;

export const reassignMentorInput = z.object({
	id: z.string().min(1),
	mentorId: z.string().min(1).nullable(),
});

export type ReassignMentorInput = z.infer<typeof reassignMentorInput>;

export const programWorkspaceOutput = z.object({
	canManagePrograms: z.boolean(),
	canManageStudents: z.boolean(),
	statuses: z.array(z.enum(ENROLLMENT_STATUSES)),
});
