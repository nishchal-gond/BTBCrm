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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { formatLedgerAmount } from "@/components/crm/money";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Program = RouterOutputs["programs"]["list"]["rows"][number];

export function NewProgramSheet() {
	return (
		<ProgramSheet
			trigger={
				<Button size="sm">
					<Icon icon={Add} data-icon="inline-start" />
					New programme
				</Button>
			}
		/>
	);
}

export function EditProgramSheet({ program }: { program: Program }) {
	return (
		<ProgramSheet
			program={program}
			trigger={
				<Button variant="outline" size="xs">
					Edit
				</Button>
			}
		/>
	);
}

function ProgramSheet({
	program,
	trigger,
}: {
	program?: Program;
	trigger: ReactNode;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [code, setCode] = useState(program?.code ?? "");
	const [name, setName] = useState(program?.name ?? "");
	const [description, setDescription] = useState(program?.description ?? "");
	const [durationWeeks, setDurationWeeks] = useState(
		String(program?.durationWeeks ?? 12),
	);
	const [priceAed, setPriceAed] = useState(program?.priceAed ?? "");

	const codeId = useId();
	const nameId = useId();
	const descriptionId = useId();
	const durationId = useId();
	const priceId = useId();

	const done = async (verb: string) => {
		await queryClient.invalidateQueries({
			queryKey: trpc.programs.list.queryKey(),
		});
		await queryClient.invalidateQueries({
			queryKey: trpc.programs.options.queryKey(),
		});
		toast.success(`${code} ${verb}.`);
		setOpen(false);
	};

	const create = useMutation(
		trpc.programs.create.mutationOptions({
			onSuccess: () => done("created"),
			onError: (error) => toast.error(error.message),
		}),
	);

	const update = useMutation(
		trpc.programs.update.mutationOptions({
			onSuccess: () => done("saved"),
			onError: (error) => toast.error(error.message),
		}),
	);

	const pending = create.isPending || update.isPending;
	const weeks = Number(durationWeeks);
	const preview =
		priceAed.trim() === "" ? null : formatLedgerAmount(priceAed.trim(), "AED");

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>{trigger}</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>
						{program ? `Edit ${program.code}` : "New programme"}
					</SheetTitle>
					<SheetDescription>
						A programme is what a student enrols on. Its code never changes once
						students are on it.
					</SheetDescription>
				</SheetHeader>

				<form
					id="programme"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();

						if (program) {
							update.mutate({
								id: program.id,
								name: name.trim(),
								description:
									description.trim() === "" ? null : description.trim(),
								durationWeeks: weeks,
								priceAed: priceAed.trim(),
							});
							return;
						}

						create.mutate({
							code: code.trim().toUpperCase(),
							name: name.trim(),
							description:
								description.trim() === "" ? null : description.trim(),
							durationWeeks: weeks,
							priceAed: priceAed.trim(),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={codeId}>Code</FieldLabel>
							<Input
								id={codeId}
								value={code}
								disabled={program !== undefined}
								onChange={(event) => setCode(event.target.value.toUpperCase())}
								placeholder="FX-FOUNDATION"
								className="font-mono"
								autoComplete="off"
								required
							/>
							<p className="text-muted-foreground text-xs">
								Capitals, digits and hyphens. It appears on every enrolment.
							</p>
						</Field>

						<Field>
							<FieldLabel htmlFor={nameId}>Name</FieldLabel>
							<Input
								id={nameId}
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Foundation in FX"
								autoComplete="off"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
							<Input
								id={descriptionId}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={durationId}>Weeks</FieldLabel>
							<Input
								id={durationId}
								type="number"
								min={1}
								max={260}
								value={durationWeeks}
								onChange={(event) => setDurationWeeks(event.target.value)}
								className="font-mono tabular-nums"
								required
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={priceId}>Price in AED</FieldLabel>
							<Input
								id={priceId}
								value={priceAed}
								inputMode="decimal"
								onChange={(event) => setPriceAed(event.target.value)}
								placeholder="25000"
								className="font-mono tabular-nums"
								autoComplete="off"
								required
							/>
							{preview ? (
								<p className="font-mono text-muted-foreground text-xs tabular-nums">
									{preview}
								</p>
							) : null}
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="programme"
						disabled={
							pending ||
							name.trim() === "" ||
							priceAed.trim() === "" ||
							!Number.isInteger(weeks) ||
							weeks < 1 ||
							(program === undefined && code.trim() === "")
						}
					>
						{pending ? <Spinner /> : null}
						{program ? "Save programme" : "Create programme"}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
