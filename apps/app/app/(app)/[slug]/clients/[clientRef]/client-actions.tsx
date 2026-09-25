"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { clientStatusLabel } from "@/components/crm/client-status";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Client = RouterOutputs["clients"]["byRef"];

const NONE = "none";

function useStaff(role: "MENTOR" | "SALES") {
	const trpc = useTRPC();

	return useQuery(
		trpc.staff.directory.queryOptions({
			q: "",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 100,
			role:
				role === "MENTOR"
					? ["MENTOR", "MENTOR_MANAGER"]
					: ["SALES", "SALES_MANAGER"],
			status: "active",
		}),
	);
}

function useRefresh(clientRef: string) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.clients.byRef.queryKey({ clientRef }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.clients.history.queryKey({ clientRef }),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.clients.list.queryKey() }),
		]);
	};
}

export function ClientActions({ client }: { client: Client }) {
	if (!client.canEdit) return null;

	return (
		<>
			<AssignMentorDialog client={client} />
			<MoveStatusDialog client={client} />
			<ConvertDialog client={client} />
		</>
	);
}

function AssignMentorDialog({ client }: { client: Client }) {
	const trpc = useTRPC();
	const refresh = useRefresh(client.clientRef);
	const [open, setOpen] = useState(false);
	const [mentorId, setMentorId] = useState(client.mentorOwner?.userId ?? NONE);
	const mentors = useStaff("MENTOR");
	const selectId = useId();

	const assign = useMutation(
		trpc.clients.assignMentor.mutationOptions({
			onSuccess: async (updated) => {
				await refresh();
				toast.success(
					updated.mentorOwner
						? `${updated.mentorOwner.name} is now the mentor for ${updated.clientRef}.`
						: `${updated.clientRef} has no mentor.`,
				);
				setOpen(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!client.canAssignMentor) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					{client.mentorOwner ? "Change mentor" : "Assign mentor"}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Mentor for {client.name}</DialogTitle>
					<DialogDescription>
						A qualified lead moves to Mentor assigned as soon as a mentor takes
						them.
					</DialogDescription>
				</DialogHeader>

				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={selectId}>Mentor</FieldLabel>
						<Select value={mentorId} onValueChange={setMentorId}>
							<SelectTrigger id={selectId}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Unassigned</SelectItem>
								{(mentors.data?.rows ?? []).map((person) => (
									<SelectItem key={person.userId} value={person.userId}>
										{person.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</FieldGroup>

				<DialogFooter>
					<Button
						disabled={assign.isPending}
						onClick={() =>
							assign.mutate({
								clientRef: client.clientRef,
								userId: mentorId === NONE ? null : mentorId,
							})
						}
					>
						{assign.isPending ? <Spinner /> : null}
						Save mentor
					</Button>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const MOVES = ["QUALIFIED", "STUDENT", "LOST", "DORMANT", "LEAD"] as const;

function MoveStatusDialog({ client }: { client: Client }) {
	const trpc = useTRPC();
	const refresh = useRefresh(client.clientRef);
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<string>(NONE);
	const [reason, setReason] = useState("");
	const statusId = useId();
	const reasonId = useId();

	const move = useMutation(
		trpc.clients.setStatus.mutationOptions({
			onSuccess: async (updated) => {
				await refresh();
				toast.success(
					`${updated.clientRef} is now ${clientStatusLabel(updated.status)}.`,
				);
				setOpen(false);
				setReason("");
				setStatus(NONE);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const options = MOVES.filter((value) => value !== client.status);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Move status
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Move {client.clientRef}</DialogTitle>
					<DialogDescription>
						This changes the status on this one record. It never makes a second
						one. Closing a client, or walking one backwards, needs a reason.
					</DialogDescription>
				</DialogHeader>

				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={statusId}>New status</FieldLabel>
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger id={statusId}>
								<SelectValue placeholder="Choose a status" />
							</SelectTrigger>
							<SelectContent>
								{options.map((value) => (
									<SelectItem key={value} value={value}>
										{clientStatusLabel(value)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>

					<Field>
						<FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
						<Input
							id={reasonId}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Went with another academy"
							autoComplete="off"
						/>
					</Field>
				</FieldGroup>

				<DialogFooter>
					<Button
						disabled={move.isPending || status === NONE}
						onClick={() =>
							move.mutate({
								clientRef: client.clientRef,
								status: status as (typeof MOVES)[number],
								reason: reason.trim() === "" ? null : reason.trim(),
							})
						}
					>
						{move.isPending ? <Spinner /> : null}
						Move
					</Button>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ConvertDialog({ client }: { client: Client }) {
	const trpc = useTRPC();
	const refresh = useRefresh(client.clientRef);
	const [open, setOpen] = useState(false);

	const convert = useMutation(
		trpc.clients.convert.mutationOptions({
			onSuccess: async (updated) => {
				await refresh();
				toast.success(
					`${updated.clientRef} is ${updated.status === "CONVERTED" ? "converted" : updated.status.toLowerCase()}.`,
				);
				setOpen(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!client.canConvert) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					{client.reconverting ? "Convert again" : "Convert"}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{client.reconverting ? "Convert again" : "Convert"} {client.name}
					</DialogTitle>
					<DialogDescription>
						{client.reconverting
							? "This client converted once already and was walked back. Converting again moves the status forward and leaves the original stamp alone."
							: `This sets the status to Converted, records ${
									client.mentorOwner
										? `${client.mentorOwner.name} as the mentor`
										: "the mentor"
								}, and stamps who closed it and when.`}
					</DialogDescription>
				</DialogHeader>

				<p className="px-4 text-muted-foreground text-sm">
					This does not create a new record. {client.clientRef} stays{" "}
					{client.clientRef}, and {client.salesOwner?.name ?? "the sales owner"}{" "}
					keeps the credit for entering them.
				</p>

				<DialogFooter>
					<Button
						disabled={convert.isPending}
						onClick={() =>
							convert.mutate({
								clientRef: client.clientRef,
								mentorId: null,
							})
						}
					>
						{convert.isPending ? <Spinner /> : null}
						Convert {client.clientRef}
					</Button>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
