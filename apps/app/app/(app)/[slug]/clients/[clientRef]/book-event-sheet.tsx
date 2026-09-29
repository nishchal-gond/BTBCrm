"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import {
	instantFromWallClock,
	wallClockIn,
	zoneLabel,
} from "@crm/validation/zoned-time";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { type EventType, eventTypeLabel } from "@/components/crm/event-type";
import { useTRPC } from "@/lib/trpc/client";
import { useViewerZone } from "@/lib/use-viewer-zone";

const HOUR_MS = 60 * 60 * 1000;

function nextHour(zone: string): { day: string; time: string } {
	const soon = new Date(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS + HOUR_MS);
	return wallClockIn(soon, zone);
}

function addMinutes(time: string, minutes: number): string {
	const [hours = "0", mins = "0"] = time.split(":");
	const total = Number(hours) * 60 + Number(mins) + minutes;
	const wrapped = ((total % 1440) + 1440) % 1440;

	return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(
		wrapped % 60,
	).padStart(2, "0")}`;
}

export function BookEventSheet({
	clientRef,
	types,
	timezone,
}: {
	clientRef: string;
	types: EventType[];
	timezone: string;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const titleId = useId();
	const dayId = useId();
	const startId = useId();
	const endId = useId();
	const locationId = useId();
	const notesId = useId();

	const viewerZone = useViewerZone();
	const zone = timezone || viewerZone;
	const opening = nextHour(zone);

	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [eventType, setEventType] = useState<EventType>(types[0] ?? "OTHER");
	const [day, setDay] = useState(opening.day);
	const [start, setStart] = useState(opening.time);
	const [end, setEnd] = useState(addMinutes(opening.time, 60));
	const [location, setLocation] = useState("");
	const [notes, setNotes] = useState("");

	const book = useMutation(
		trpc.events.create.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.events.forClient.queryKey({ clientRef }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.clients.byRef.queryKey({ clientRef }),
					}),
				]);
				toast.success(`Booked on ${clientRef}'s schedule.`);
				setOpen(false);
				setTitle("");
				setLocation("");
				setNotes("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const startsAt = instantFromWallClock({ day, time: start }, zone);
	const endsAt = instantFromWallClock({ day, time: end }, zone);
	const backwards =
		startsAt !== null &&
		endsAt !== null &&
		endsAt.getTime() <= startsAt.getTime();

	const ready =
		title.trim() !== "" && startsAt !== null && endsAt !== null && !backwards;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Icon icon={Calendar} data-icon="inline-start" />
					Book something
				</Button>
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>Book on {clientRef}</SheetTitle>
					<SheetDescription>
						Times are the wall clock in{" "}
						{startsAt ? zoneLabel(startsAt, zone) : zone}. The record keeps the
						zone, so the hour survives a daylight-saving change.
					</SheetDescription>
				</SheetHeader>

				<form
					id="book-event"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();

						if (!startsAt || !endsAt) return;

						book.mutate({
							title: title.trim(),
							description: notes.trim() === "" ? null : notes.trim(),
							eventType,
							startsAt: startsAt.toISOString(),
							endsAt: endsAt.toISOString(),
							timezone: zone,
							isAllDay: false,
							location: location.trim() === "" ? null : location.trim(),
							clientRef,
							attendeeIds: [],
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={titleId}>What is it</FieldLabel>
							<Input
								id={titleId}
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Discovery call"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="book-event-type">Kind</FieldLabel>
							<Select
								value={eventType}
								onValueChange={(value) => setEventType(value as EventType)}
							>
								<SelectTrigger id="book-event-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{types.map((type) => (
										<SelectItem key={type} value={type}>
											{eventTypeLabel(type)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={dayId}>Day</FieldLabel>
							<Input
								id={dayId}
								type="date"
								value={day}
								onChange={(event) => setDay(event.target.value)}
								required
							/>
						</Field>

						<div className="grid grid-cols-2 gap-3">
							<Field>
								<FieldLabel htmlFor={startId}>From</FieldLabel>
								<Input
									id={startId}
									type="time"
									value={start}
									onChange={(event) => {
										setStart(event.target.value);
										setEnd(addMinutes(event.target.value, 60));
									}}
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={endId}>To</FieldLabel>
								<Input
									id={endId}
									type="time"
									value={end}
									onChange={(event) => setEnd(event.target.value)}
									aria-invalid={backwards}
									required
								/>
								{backwards ? (
									<FieldDescription className="text-negative-on-muted">
										An event ends after it starts.
									</FieldDescription>
								) : null}
							</Field>
						</div>

						<Field>
							<FieldLabel htmlFor={locationId}>Where</FieldLabel>
							<Input
								id={locationId}
								value={location}
								onChange={(event) => setLocation(event.target.value)}
								placeholder="Office, or a meeting link"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={notesId}>Notes</FieldLabel>
							<Textarea
								id={notesId}
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								rows={3}
							/>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="book-event"
						disabled={!ready || book.isPending}
					>
						{book.isPending ? <Spinner data-icon="inline-start" /> : null}
						Book it
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
