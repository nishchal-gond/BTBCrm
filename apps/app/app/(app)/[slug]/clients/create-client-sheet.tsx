"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
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
import Link from "next/link";
import { parseAsBoolean, useQueryState } from "nuqs";
import { type ComponentProps, useId, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Vertical = RouterOutputs["clients"]["byRef"]["vertical"];

function AddButton(props: ComponentProps<typeof Button>) {
	return (
		<Button {...props}>
			<Icon icon={Add} data-icon="inline-start" />
			New client
		</Button>
	);
}

export function CreateClientSheet({ vertical }: { vertical: Vertical }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();

	const [open, setOpen] = useQueryState(
		"create",
		parseAsBoolean.withDefault(false),
	);
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [source, setSource] = useState("");

	const firstNameId = useId();
	const lastNameId = useId();
	const emailId = useId();
	const phoneId = useId();
	const sourceId = useId();

	const settled = email.includes("@") || phone.trim().length >= 6;

	const duplicate = useQuery({
		...trpc.clients.duplicateCheck.queryOptions({
			email: email.includes("@") ? email.trim() : null,
			phone: phone.trim() === "" ? null : phone.trim(),
		}),
		enabled: open && settled,
	});

	const match = duplicate.data;

	const create = useMutation(
		trpc.clients.create.mutationOptions({
			onSuccess: async (client) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.clients.list.queryKey(),
				});
				toast.success(`${client.name} entered as ${client.clientRef}.`);
				await setOpen(null);
				setFirstName("");
				setLastName("");
				setEmail("");
				setPhone("");
				setSource("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Sheet open={open} onOpenChange={(next) => setOpen(next || null)}>
			<SheetTrigger asChild>
				<AddButton />
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>New client</SheetTitle>
					<SheetDescription>
						One person is one record for life. If they are already here, open
						that record rather than entering them twice.
					</SheetDescription>
				</SheetHeader>

				<form
					id="create-client"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({
							vertical,
							firstName: firstName.trim(),
							lastName: lastName.trim(),
							email: email.trim() === "" ? null : email.trim(),
							phone: phone.trim() === "" ? null : phone.trim(),
							country: null,
							city: null,
							source: source.trim() === "" ? null : source.trim(),
							salesOwnerId: null,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={firstNameId}>First name</FieldLabel>
							<Input
								id={firstNameId}
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={lastNameId}>Last name</FieldLabel>
							<Input
								id={lastNameId}
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={emailId}>Email</FieldLabel>
							<Input
								id={emailId}
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={phoneId}>Phone</FieldLabel>
							<Input
								id={phoneId}
								value={phone}
								onChange={(event) => setPhone(event.target.value)}
								placeholder="+971 50 123 4567"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={sourceId}>Source</FieldLabel>
							<Input
								id={sourceId}
								value={source}
								onChange={(event) => setSource(event.target.value)}
								placeholder="Referral, webinar, walk-in…"
								autoComplete="off"
							/>
						</Field>

						{match?.exists ? (
							<p
								role="status"
								className="rounded-md border border-warning-border bg-warning-muted px-3 py-2 text-sm text-warning"
							>
								{match.match ? (
									<>
										{match.match.name} is already here as{" "}
										<Link
											className="font-mono underline underline-offset-4"
											href={workspaceUrl(`/clients/${match.match.clientRef}`)}
										>
											{match.match.clientRef}
										</Link>
										{match.match.salesOwner
											? `, owned by ${match.match.salesOwner.name}.`
											: ", unassigned."}
									</>
								) : (
									"Somebody with these details is already in the CRM. Ask an administrator to open that record for you."
								)}
							</p>
						) : null}
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="create-client"
						disabled={
							create.isPending ||
							firstName.trim() === "" ||
							lastName.trim() === "" ||
							(email.trim() === "" && phone.trim() === "")
						}
					>
						{create.isPending ? <Spinner /> : null}
						Enter client
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
