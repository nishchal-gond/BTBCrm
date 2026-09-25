"use client";

import Education from "@carbon/icons-react/es/Education";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
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
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { formatLedgerAmount } from "@/components/crm/money";
import { useTRPC } from "@/lib/trpc/client";

const KEEP = "keep";

export function EnrollSheet({ clientRef }: { clientRef: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [programId, setProgramId] = useState("");
	const [mentorId, setMentorId] = useState(KEEP);
	const [cohort, setCohort] = useState("");
	const [notes, setNotes] = useState("");

	const cohortId = useId();
	const notesId = useId();

	const programs = useQuery({
		...trpc.programs.options.queryOptions(),
		enabled: open,
	});
	const mentors = useQuery({
		...trpc.staff.directory.queryOptions({
			q: "",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 100,
			role: ["MENTOR", "MENTOR_MANAGER"],
			status: "active",
		}),
		enabled: open,
	});

	const chosen = (programs.data ?? []).find((row) => row.id === programId);

	const enroll = useMutation(
		trpc.programs.enroll.mutationOptions({
			onSuccess: async (enrollment) => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.programs.forClient.queryKey({ clientRef }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.clients.byRef.queryKey({ clientRef }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.clients.history.queryKey({ clientRef }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.clients.list.queryKey(),
					}),
				]);
				toast.success(`${clientRef} enrolled on ${enrollment.program.code}.`);
				setOpen(false);
				setProgramId("");
				setCohort("");
				setNotes("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Icon icon={Education} data-icon="inline-start" />
					Enrol on a programme
				</Button>
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>Enrol {clientRef}</SheetTitle>
					<SheetDescription>
						Enrolling moves this client to Student. It changes the status on the
						record they already have; it never makes a second one.
					</SheetDescription>
				</SheetHeader>

				<form
					id="enrol"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						enroll.mutate({
							clientRef,
							programId,
							mentorId: mentorId === KEEP ? null : mentorId,
							cohort: cohort.trim() === "" ? null : cohort.trim(),
							notes: notes.trim() === "" ? null : notes.trim(),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="enrol-programme">Programme</FieldLabel>
							<Select value={programId} onValueChange={setProgramId}>
								<SelectTrigger id="enrol-programme">
									<SelectValue placeholder="Choose a programme" />
								</SelectTrigger>
								<SelectContent>
									{(programs.data ?? []).map((row) => (
										<SelectItem key={row.id} value={row.id}>
											{row.code} · {row.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{chosen ? (
								<p className="text-muted-foreground text-xs">
									{chosen.durationWeeks} weeks ·{" "}
									<span className="font-mono tabular-nums">
										{formatLedgerAmount(chosen.priceAed, "AED")}
									</span>
								</p>
							) : null}
							{programs.data?.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									No programme is running. An administrator defines them under
									Programmes.
								</p>
							) : null}
						</Field>

						<Field>
							<FieldLabel htmlFor="enrol-mentor">Mentor</FieldLabel>
							<Select value={mentorId} onValueChange={setMentorId}>
								<SelectTrigger id="enrol-mentor">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={KEEP}>
										The mentor who converted them
									</SelectItem>
									{(mentors.data?.rows ?? []).map((person) => (
										<SelectItem key={person.userId} value={person.userId}>
											{person.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={cohortId}>Cohort</FieldLabel>
							<Input
								id={cohortId}
								value={cohort}
								onChange={(event) => setCohort(event.target.value)}
								placeholder="Jan 2026"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={notesId}>Notes</FieldLabel>
							<Input
								id={notesId}
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								autoComplete="off"
							/>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="enrol"
						disabled={enroll.isPending || programId === ""}
					>
						{enroll.isPending ? <Spinner /> : null}
						Enrol
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
