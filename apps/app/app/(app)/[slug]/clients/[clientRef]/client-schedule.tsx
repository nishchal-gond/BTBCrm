"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import { Button } from "@crm/ui/components/button";
import { Separator } from "@crm/ui/components/separator";
import { Skeleton } from "@crm/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	EventResponseBadge,
	EventTypeBadge,
} from "@/components/crm/event-type";
import { PageNotice } from "@/components/page-notice";
import { QueryError } from "@/components/query-error";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { BookEventSheet } from "./book-event-sheet";
import { EventMoment } from "./event-moment";

type ScheduleEvent = RouterOutputs["events"]["forClient"]["upcoming"][number];

function EventRow({
	event,
	onCancel,
	cancelling,
	onRespond,
	responding,
}: {
	event: ScheduleEvent;
	onCancel: (id: string) => void;
	cancelling: boolean;
	onRespond: (id: string, response: "ACCEPTED" | "DECLINED") => void;
	responding: boolean;
}) {
	const others = event.attendees.filter(
		(attendee) => attendee.userId !== event.organizer.userId,
	);

	return (
		<li className="flex flex-col gap-2 border-subtle border-b px-4 py-3 last:border-b-0">
			<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
				<div className="flex min-w-0 flex-col gap-1">
					<span
						className={
							event.isCancelled
								? "font-medium text-muted-foreground text-sm line-through"
								: "font-medium text-sm"
						}
					>
						{event.title}
					</span>
					<EventMoment
						startsAt={event.startsAt}
						endsAt={event.endsAt}
						timezone={event.timezone}
						isAllDay={event.isAllDay}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<EventTypeBadge type={event.eventType} />
					{event.isCancelled ? (
						<span className="text-muted-foreground text-xs">Cancelled</span>
					) : null}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
				<span>Organiser: {event.organizer.name}</span>
				{event.location ? <span>{event.location}</span> : null}
				{others.length > 0 ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-default underline decoration-dotted underline-offset-4">
								{others.length} other{others.length === 1 ? "" : "s"} invited
							</span>
						</TooltipTrigger>
						<TooltipContent>
							{others
								.map((attendee) => `${attendee.name} — ${attendee.response}`)
								.join("\n")}
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>

			{event.description ? (
				<p className="whitespace-pre-line text-muted-foreground text-xs">
					{event.description}
				</p>
			) : null}

			<div className="flex flex-wrap items-center gap-2">
				{event.viewerResponse !== null ? (
					<EventResponseBadge response={event.viewerResponse} />
				) : null}
				{event.viewerResponse !== null && !event.isCancelled ? (
					<>
						<Button
							variant="outline"
							size="xs"
							disabled={responding || event.viewerResponse === "ACCEPTED"}
							onClick={() => onRespond(event.id, "ACCEPTED")}
						>
							Going
						</Button>
						<Button
							variant="outline"
							size="xs"
							disabled={responding || event.viewerResponse === "DECLINED"}
							onClick={() => onRespond(event.id, "DECLINED")}
						>
							Not going
						</Button>
					</>
				) : null}
				{event.canEdit ? (
					<Button
						variant="ghost"
						size="xs"
						className="ms-auto text-negative-on-muted"
						disabled={cancelling}
						onClick={() => onCancel(event.id)}
					>
						Cancel it
					</Button>
				) : null}
			</div>
		</li>
	);
}

export function ClientSchedule({
	clientRef,
	clientName,
}: {
	clientRef: string;
	clientName: string;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const schedule = useQuery({
		...trpc.events.forClient.queryOptions({ clientRef }),
		retry: false,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.events.forClient.queryKey({ clientRef }),
		});

	const cancel = useMutation(
		trpc.events.cancel.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success("Cancelled. The booking stays in the history.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const respond = useMutation(
		trpc.events.respond.mutationOptions({
			onSuccess: async () => {
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (schedule.isError) {
		return (
			<QueryError
				title="The schedule did not load"
				message={schedule.error.message}
				onRetry={() => void schedule.refetch()}
				retrying={schedule.isFetching}
			/>
		);
	}

	if (schedule.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<span role="status" className="sr-only">
					Loading the schedule…
				</span>
				<Skeleton className="h-8 w-40" aria-hidden="true" />
				<Skeleton className="h-32 w-full rounded-lg" aria-hidden="true" />
				<Skeleton className="h-24 w-full rounded-lg" aria-hidden="true" />
			</div>
		);
	}

	const { upcoming, past, canCreate, types, timezone } = schedule.data;
	const nothing = upcoming.length === 0 && past.length === 0;

	const rowProps = {
		onCancel: (id: string) => cancel.mutate({ id, reason: null }),
		cancelling: cancel.isPending,
		onRespond: (id: string, response: "ACCEPTED" | "DECLINED") =>
			respond.mutate({ id, response }),
		responding: respond.isPending,
	};

	return (
		<div className="flex flex-col gap-4">
			{canCreate && types.length > 0 ? (
				<div className="flex justify-end">
					<BookEventSheet
						clientRef={clientRef}
						types={types}
						timezone={timezone}
					/>
				</div>
			) : null}

			{nothing ? (
				<PageNotice icon={Calendar} title={`Nothing booked with ${clientName}`}>
					{canCreate
						? "Book a call, a session or a review and it appears here, past and future."
						: "Bookings made by the people who own this client appear here."}
				</PageNotice>
			) : null}

			{upcoming.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h2 className="font-medium text-sm">Coming up</h2>
					<ol className="flex flex-col rounded-lg border bg-card">
						{upcoming.map((event) => (
							<EventRow key={event.id} event={event} {...rowProps} />
						))}
					</ol>
				</section>
			) : null}

			{past.length > 0 ? (
				<section className="flex flex-col gap-2">
					{upcoming.length > 0 ? <Separator className="my-2" /> : null}
					<h2 className="font-medium text-sm">Already happened</h2>
					<ol className="flex flex-col rounded-lg border bg-card">
						{past.map((event) => (
							<EventRow key={event.id} event={event} {...rowProps} />
						))}
					</ol>
				</section>
			) : null}
		</div>
	);
}
