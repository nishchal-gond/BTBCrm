import { EVENT_RESPONSES, EVENT_TYPES } from "@crm/db/company-events";
import { isTimeZone } from "@crm/validation/time-zone";
import { z } from "zod";

const trimmed = z.string().trim();

const optionalText = (max: number) =>
	trimmed
		.max(max)
		.nullable()
		.transform((value) => (value === null || value === "" ? null : value));

const instant = z.iso.datetime({ offset: true });

const zone = trimmed
	.min(1)
	.max(64)
	.refine(isTimeZone, "Use an IANA time zone identifier, like Asia/Dubai.");

export const attendeeOutput = z.object({
	userId: z.string(),
	name: z.string(),
	response: z.enum(EVENT_RESPONSES),
	respondedAt: z.string().nullable(),
});

export const eventOutput = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	eventType: z.enum(EVENT_TYPES),
	startsAt: z.string(),
	endsAt: z.string(),
	timezone: z.string(),
	isAllDay: z.boolean(),
	location: z.string().nullable(),
	organizer: z.object({ userId: z.string(), name: z.string() }),
	clientRef: z.string().nullable(),
	clientName: z.string().nullable(),
	isCancelled: z.boolean(),
	attendees: z.array(attendeeOutput),
	viewerResponse: z.enum(EVENT_RESPONSES).nullable(),
	canEdit: z.boolean(),
});

export type EventRow = z.infer<typeof eventOutput>;

export const eventsForClientInput = z.object({
	clientRef: trimmed.min(1),
});

export type EventsForClientInput = z.infer<typeof eventsForClientInput>;

export const eventsForClientOutput = z.object({
	upcoming: z.array(eventOutput),
	past: z.array(eventOutput),
	canCreate: z.boolean(),
	types: z.array(z.enum(EVENT_TYPES)),
	timezone: z.string(),
});

export const createEventInput = z.object({
	title: trimmed.min(1).max(160),
	description: optionalText(2000).default(null),
	eventType: z.enum(EVENT_TYPES),
	startsAt: instant,
	endsAt: instant,
	timezone: zone,
	isAllDay: z.boolean().default(false),
	location: optionalText(240).default(null),
	clientRef: optionalText(40).default(null),
	attendeeIds: z.array(z.string().min(1)).max(50).default([]),
});

export type CreateEventInput = z.infer<typeof createEventInput>;

export const updateEventInput = z.object({
	id: z.string().min(1),
	title: trimmed.min(1).max(160).optional(),
	description: optionalText(2000).optional(),
	startsAt: instant.optional(),
	endsAt: instant.optional(),
	timezone: zone.optional(),
	isAllDay: z.boolean().optional(),
	location: optionalText(240).optional(),
	attendeeIds: z.array(z.string().min(1)).max(50).optional(),
});

export type UpdateEventInput = z.infer<typeof updateEventInput>;

export const cancelEventInput = z.object({
	id: z.string().min(1),
	reason: optionalText(300).default(null),
});

export type CancelEventInput = z.infer<typeof cancelEventInput>;

export const respondToEventInput = z.object({
	id: z.string().min(1),
	response: z.enum(EVENT_RESPONSES),
});

export type RespondToEventInput = z.infer<typeof respondToEventInput>;

export const busyRangesInput = z.object({
	userIds: z.array(z.string().min(1)).min(1).max(20),
	from: instant,
	to: instant,
});

export type BusyRangesInput = z.infer<typeof busyRangesInput>;

export const busyRangesOutput = z.array(
	z.object({
		userId: z.string(),
		startsAt: z.string(),
		endsAt: z.string(),
	}),
);
