import { type Db, Prisma, withActor } from "@crm/db";
import {
	type Actor,
	canEditClient,
	clientScope,
	eventScope,
} from "@crm/db/access";
import {
	canCreateEventType,
	eventTypesFor,
	isCompanyEventType,
	judgeEventTimes,
} from "@crm/db/company-events";
import type { CompanyEventType } from "@crm/db/enums";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	BusyRangesInput,
	CancelEventInput,
	CreateEventInput,
	EventRow,
	RespondToEventInput,
	UpdateEventInput,
} from "./events.contracts";

const PERSON_SELECT = {
	userId: true,
	user: { select: { name: true } },
} as const;

const EVENT_SELECT = {
	id: true,
	title: true,
	description: true,
	eventType: true,
	startsAt: true,
	endsAt: true,
	timezone: true,
	isAllDay: true,
	location: true,
	isCancelled: true,
	organizerId: true,
	organizer: { select: PERSON_SELECT },
	client: {
		select: {
			id: true,
			clientRef: true,
			firstName: true,
			lastName: true,
			vertical: true,
			salesOwnerId: true,
			mentorOwnerId: true,
		},
	},
	attendees: {
		select: {
			userId: true,
			response: true,
			respondedAt: true,
			user: { select: { user: { select: { name: true } } } },
		},
		orderBy: { userId: "asc" },
	},
} as const;

type EventShape = Prisma.CompanyEventGetPayload<{
	select: typeof EVENT_SELECT;
}>;

const NOT_FOUND = "No such event, or it is not yours to see.";

const MAX_BUSY_DAYS = 62;

@Injectable()
export class EventsService {
	private readonly logger = new Logger(EventsService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	private row(actor: Actor, event: EventShape): EventRow {
		const mine = event.attendees.find(
			(attendee) => attendee.userId === actor.userId,
		);

		return {
			id: event.id,
			title: event.title,
			description: event.description,
			eventType: event.eventType,
			startsAt: event.startsAt.toISOString(),
			endsAt: event.endsAt.toISOString(),
			timezone: event.timezone,
			isAllDay: event.isAllDay,
			location: event.location,
			organizer: {
				userId: event.organizer.userId,
				name: event.organizer.user.name,
			},
			clientRef: event.client?.clientRef ?? null,
			clientName: event.client
				? `${event.client.firstName} ${event.client.lastName}`
				: null,
			isCancelled: event.isCancelled,
			attendees: event.attendees.map((attendee) => ({
				userId: attendee.userId,
				name: attendee.user.user.name,
				response: attendee.response,
				respondedAt: attendee.respondedAt?.toISOString() ?? null,
			})),
			viewerResponse: mine?.response ?? null,
			canEdit: this.mayEdit(actor, event),
		};
	}

	private mayEdit(actor: Actor, event: EventShape): boolean {
		if (actor.role === "ADMIN") return true;
		if (event.isCancelled) return false;
		return event.organizerId === actor.userId;
	}

	private async clientFor(actor: Actor, clientRef: string) {
		const client = await this.db.client.findFirst({
			where: { clientRef, ...clientScope(actor) },
			select: {
				id: true,
				clientRef: true,
				vertical: true,
				salesOwnerId: true,
				mentorOwnerId: true,
			},
		});

		if (!client) {
			throw new NotFoundException(
				"No client with that reference, or it is not yours to see.",
			);
		}

		return client;
	}

	async forClient(actor: Actor, clientRef: string) {
		const client = await this.clientFor(actor, clientRef);
		const now = new Date();

		const [upcoming, past] = await Promise.all([
			this.db.companyEvent.findMany({
				where: { clientId: client.id, endsAt: { gte: now } },
				select: EVENT_SELECT,
				orderBy: { startsAt: "asc" },
				take: 50,
			}),
			this.db.companyEvent.findMany({
				where: { clientId: client.id, endsAt: { lt: now } },
				select: EVENT_SELECT,
				orderBy: { startsAt: "desc" },
				take: 50,
			}),
		]);

		const profile = await this.db.staffProfile.findUnique({
			where: { userId: actor.userId },
			select: { timezone: true },
		});

		return {
			upcoming: upcoming.map((event) => this.row(actor, event)),
			past: past.map((event) => this.row(actor, event)),
			canCreate:
				canEditClient(actor, client) && eventTypesFor(actor).length > 0,
			types: eventTypesFor(actor).filter((type) => !isCompanyEventType(type)),
			timezone: profile?.timezone ?? "Asia/Dubai",
		};
	}

	private async requireAttendeesAreStaff(userIds: string[]): Promise<void> {
		if (userIds.length === 0) return;

		const found = await this.db.staffProfile.count({
			where: { userId: { in: userIds }, isActive: true },
		});

		if (found !== userIds.length) {
			throw new BadRequestException(
				"One of those people has no active staff profile.",
			);
		}
	}

	private requireType(actor: Actor, type: CompanyEventType): void {
		if (canCreateEventType(actor, type)) return;

		throw new ForbiddenException(
			isCompanyEventType(type)
				? "A company-wide event is an administrator's to create."
				: "That kind of event belongs to the other side of the business.",
		);
	}

	async create(actor: Actor, input: CreateEventInput): Promise<EventRow> {
		this.requireType(actor, input.eventType);

		const times = {
			startsAt: new Date(input.startsAt),
			endsAt: new Date(input.endsAt),
		};

		const verdict = judgeEventTimes(times);
		if (!verdict.allowed) throw new BadRequestException(verdict.because);

		let clientId: string | null = null;

		if (input.clientRef !== null) {
			if (isCompanyEventType(input.eventType)) {
				throw new BadRequestException(
					"A company-wide event belongs to the company, not to one client.",
				);
			}

			const client = await this.clientFor(actor, input.clientRef);

			if (!canEditClient(actor, client)) {
				throw new ForbiddenException(
					"This client belongs to somebody else. Ask their owner or an administrator.",
				);
			}

			clientId = client.id;
		}

		const attendeeIds = [...new Set(input.attendeeIds)].filter(
			(id) => id !== actor.userId,
		);

		await this.requireAttendeesAreStaff(attendeeIds);

		const created = await withActor(this.db, { actorId: actor.userId }, (tx) =>
			tx.companyEvent.create({
				data: {
					title: input.title,
					description: input.description,
					eventType: input.eventType,
					startsAt: times.startsAt,
					endsAt: times.endsAt,
					timezone: input.timezone,
					isAllDay: input.isAllDay,
					location: input.location,
					organizerId: actor.userId,
					clientId,
					createdById: actor.userId,
					attendees: {
						create: [
							{ userId: actor.userId, response: "ACCEPTED" },
							...attendeeIds.map((userId) => ({ userId })),
						],
					},
				},
				select: EVENT_SELECT,
			}),
		);

		if (clientId !== null) {
			await this.db.client.update({
				where: { id: clientId },
				data: { lastActivityAt: new Date() },
			});
		}

		this.logger.log({
			message: "Event created",
			eventType: created.eventType,
			clientRef: created.client?.clientRef ?? null,
		});

		return this.row(actor, created);
	}

	private async readable(actor: Actor, id: string): Promise<EventShape> {
		const event = await this.db.companyEvent.findFirst({
			where: { id, ...eventScope(actor) },
			select: EVENT_SELECT,
		});

		if (!event) throw new NotFoundException(NOT_FOUND);

		return event;
	}

	private requireEdit(actor: Actor, event: EventShape): void {
		if (this.mayEdit(actor, event)) return;

		throw new ForbiddenException(
			event.isCancelled
				? "That event is cancelled. A cancelled event is history."
				: "Only the organiser or an administrator changes an event.",
		);
	}

	async update(actor: Actor, input: UpdateEventInput): Promise<EventRow> {
		const event = await this.readable(actor, input.id);
		this.requireEdit(actor, event);

		const startsAt =
			input.startsAt === undefined ? event.startsAt : new Date(input.startsAt);
		const endsAt =
			input.endsAt === undefined ? event.endsAt : new Date(input.endsAt);

		const verdict = judgeEventTimes({ startsAt, endsAt });
		if (!verdict.allowed) throw new BadRequestException(verdict.because);

		const data: Prisma.CompanyEventUpdateInput = { startsAt, endsAt };

		if (input.title !== undefined) data.title = input.title;
		if (input.description !== undefined) data.description = input.description;
		if (input.timezone !== undefined) data.timezone = input.timezone;
		if (input.isAllDay !== undefined) data.isAllDay = input.isAllDay;
		if (input.location !== undefined) data.location = input.location;

		const attendeeIds =
			input.attendeeIds === undefined
				? null
				: [...new Set(input.attendeeIds)].filter(
						(id) => id !== event.organizerId,
					);

		if (attendeeIds !== null) await this.requireAttendeesAreStaff(attendeeIds);

		const updated = await withActor(
			this.db,
			{ actorId: actor.userId },
			async (tx) => {
				if (attendeeIds !== null) {
					await tx.companyEventAttendee.deleteMany({
						where: {
							eventId: event.id,
							userId: { notIn: [event.organizerId, ...attendeeIds] },
						},
					});

					await tx.companyEventAttendee.createMany({
						data: attendeeIds.map((userId) => ({
							eventId: event.id,
							userId,
						})),
						skipDuplicates: true,
					});
				}

				return tx.companyEvent.update({
					where: { id: event.id },
					data,
					select: EVENT_SELECT,
				});
			},
		);

		return this.row(actor, updated);
	}

	async cancel(actor: Actor, input: CancelEventInput): Promise<EventRow> {
		const event = await this.readable(actor, input.id);
		this.requireEdit(actor, event);

		const description =
			input.reason === null
				? event.description
				: [event.description, `Cancelled: ${input.reason}`]
						.filter((line) => line !== null && line !== "")
						.join("\n\n");

		const cancelled = await withActor(
			this.db,
			{ actorId: actor.userId },
			(tx) =>
				tx.companyEvent.update({
					where: { id: event.id },
					data: { isCancelled: true, description },
					select: EVENT_SELECT,
				}),
		);

		this.logger.log({ message: "Event cancelled", eventId: event.id });

		return this.row(actor, cancelled);
	}

	async respond(actor: Actor, input: RespondToEventInput): Promise<EventRow> {
		const event = await this.readable(actor, input.id);

		const invited = event.attendees.some(
			(attendee) => attendee.userId === actor.userId,
		);

		if (!invited) {
			throw new ForbiddenException(
				"You are not on the invitation, so there is nothing to answer.",
			);
		}

		if (event.isCancelled) {
			throw new BadRequestException("That event is cancelled.");
		}

		const updated = await withActor(
			this.db,
			{ actorId: actor.userId },
			async (tx) => {
				await tx.companyEventAttendee.update({
					where: {
						eventId_userId: { eventId: event.id, userId: actor.userId },
					},
					data: { response: input.response },
				});

				return tx.companyEvent.findFirstOrThrow({
					where: { id: event.id },
					select: EVENT_SELECT,
				});
			},
		);

		return this.row(actor, updated);
	}

	async busyRanges(input: BusyRangesInput) {
		const from = new Date(input.from);
		const to = new Date(input.to);

		if (to.getTime() <= from.getTime()) {
			throw new BadRequestException("The window ends after it starts.");
		}

		const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);

		if (days > MAX_BUSY_DAYS) {
			throw new BadRequestException(
				`Ask for at most ${MAX_BUSY_DAYS} days at a time.`,
			);
		}

		const people = await this.db.staffProfile.findMany({
			where: { userId: { in: input.userIds }, isActive: true },
			select: { userId: true },
		});

		const known = people.map((person) => person.userId);

		if (known.length === 0) return [];

		const rows = await this.db.companyEvent.findMany({
			where: {
				isCancelled: false,
				startsAt: { lt: to },
				endsAt: { gt: from },
				OR: [
					{ organizerId: { in: known } },
					{ attendees: { some: { userId: { in: known } } } },
				],
			},
			select: {
				startsAt: true,
				endsAt: true,
				organizerId: true,
				attendees: { select: { userId: true } },
			},
			orderBy: { startsAt: "asc" },
			take: 500,
		});

		const wanted = new Set(known);
		const ranges: { userId: string; startsAt: string; endsAt: string }[] = [];

		for (const row of rows) {
			const busy = new Set<string>();

			if (wanted.has(row.organizerId)) busy.add(row.organizerId);

			for (const attendee of row.attendees) {
				if (wanted.has(attendee.userId)) busy.add(attendee.userId);
			}

			for (const userId of busy) {
				ranges.push({
					userId,
					startsAt: row.startsAt.toISOString(),
					endsAt: row.endsAt.toISOString(),
				});
			}
		}

		return ranges;
	}
}
