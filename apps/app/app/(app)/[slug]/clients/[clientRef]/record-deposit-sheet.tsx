"use client";

import Add from "@carbon/icons-react/es/Add";
import { isAmount, judgeEntry, parseAmount } from "@crm/db/deposit-ledger";
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
import { depositEntryLabel } from "@/components/crm/deposit-entry";
import { formatLedgerAmount } from "@/components/crm/money";
import { instantForDay, todayInZone } from "@/lib/company-time";
import { useTRPC } from "@/lib/trpc/client";
import { useViewerZone } from "@/lib/use-viewer-zone";

const METHODS = ["Bank transfer", "Card", "Cash", "Cheque"] as const;

export function RecordDepositSheet({ clientRef }: { clientRef: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [open, setOpen] = useState(false);
	const [entryType, setEntryType] = useState("PAYMENT");
	const [amount, setAmount] = useState("");
	const [method, setMethod] = useState<string>(METHODS[0]);
	const [reference, setReference] = useState("");
	const [note, setNote] = useState("");
	const [correctsId, setCorrectsId] = useState("");
	const zone = useViewerZone();
	const [occurredOn, setOccurredOn] = useState(todayInZone(zone));

	const amountId = useId();
	const referenceId = useId();
	const noteId = useId();
	const dateId = useId();

	const workspace = useQuery(trpc.deposits.workspace.queryOptions());
	const ledger = useQuery({
		...trpc.deposits.forClient.queryOptions({ clientRef }),
		enabled: open,
	});

	const entryTypes = workspace.data?.entryTypes ?? ["PAYMENT"];
	const currency = workspace.data?.currency ?? "AED";
	const corrects = entryType === "ADJUSTMENT";

	const record = useMutation(
		trpc.deposits.record.mutationOptions({
			onSuccess: async (entry) => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.deposits.forClient.queryKey({ clientRef }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.deposits.list.queryKey(),
					}),
				]);
				toast.success(
					`${formatLedgerAmount(entry.amount, entry.currency)} recorded against ${entry.clientRef}.`,
				);
				setOpen(false);
				setAmount("");
				setReference("");
				setNote("");
				setCorrectsId("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const typed = amount.trim();
	const parsed = typed === "" ? null : parseAmount(typed);
	const reading = parsed !== null && isAmount(parsed) ? parsed : null;
	const verdict =
		reading === null
			? null
			: judgeEntry(
					entryType as "PAYMENT" | "REFUND" | "ADJUSTMENT",
					reading.fils,
					corrects && correctsId !== "" ? correctsId : null,
				);

	const amountProblem =
		typed === ""
			? null
			: reading === null
				? (parsed as { because: string }).because
				: verdict && !verdict.allowed
					? verdict.because
					: null;

	const preview = reading === null ? null : formatLedgerAmount(typed, currency);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button size="sm">
					<Icon icon={Add} data-icon="inline-start" />
					Record money
				</Button>
			</SheetTrigger>
			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>Record money for {clientRef}</SheetTitle>
					<SheetDescription>
						The ledger is append-only. This entry can be corrected later by an
						adjustment, never edited.
					</SheetDescription>
				</SheetHeader>

				<form
					id="record-deposit"
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						record.mutate({
							clientRef,
							entryType: entryType as "PAYMENT" | "REFUND" | "ADJUSTMENT",
							amount: amount.trim(),
							method: method === "" ? null : method,
							reference: reference.trim() === "" ? null : reference.trim(),
							note: note.trim() === "" ? null : note.trim(),
							correctsId: corrects && correctsId !== "" ? correctsId : null,
							occurredAt: instantForDay(occurredOn, zone),
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="record-deposit-entry">Entry</FieldLabel>
							<Select value={entryType} onValueChange={setEntryType}>
								<SelectTrigger id="record-deposit-entry">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{entryTypes.map((value) => (
										<SelectItem key={value} value={value}>
											{depositEntryLabel(value)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={amountId}>Amount in {currency}</FieldLabel>
							<Input
								id={amountId}
								value={amount}
								inputMode="decimal"
								aria-invalid={amountProblem !== null}
								onChange={(event) => setAmount(event.target.value)}
								placeholder={entryType === "REFUND" ? "-1000" : "25000"}
								className="font-mono tabular-nums"
								autoComplete="off"
								required
							/>
							{preview ? (
								<p className="font-mono text-muted-foreground text-xs tabular-nums">
									{preview}
								</p>
							) : null}
							{amountProblem ? (
								<p role="alert" className="text-negative-on-muted text-xs">
									{amountProblem}
								</p>
							) : entryType === "REFUND" ? (
								<p className="text-muted-foreground text-xs">
									A refund is money out, so its amount is negative.
								</p>
							) : null}
						</Field>

						{corrects ? (
							<Field>
								<FieldLabel htmlFor="record-deposit-corrects">
									Corrects
								</FieldLabel>
								<Select value={correctsId} onValueChange={setCorrectsId}>
									<SelectTrigger id="record-deposit-corrects">
										<SelectValue placeholder="Choose the entry to correct" />
									</SelectTrigger>
									<SelectContent>
										{(ledger.data?.rows ?? []).map((row) => (
											<SelectItem key={row.id} value={row.id}>
												{formatLedgerAmount(row.amount, row.currency)} ·{" "}
												{depositEntryLabel(row.entryType)} ·{" "}
												{row.occurredAt.slice(0, 10)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						) : null}

						<Field>
							<FieldLabel htmlFor="record-deposit-method">Method</FieldLabel>
							<Select value={method} onValueChange={setMethod}>
								<SelectTrigger id="record-deposit-method">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{METHODS.map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor={referenceId}>Reference</FieldLabel>
							<Input
								id={referenceId}
								value={reference}
								onChange={(event) => setReference(event.target.value)}
								placeholder="TT-4471"
								className="font-mono"
								autoComplete="off"
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={dateId}>Received on</FieldLabel>
							<Input
								id={dateId}
								type="date"
								value={occurredOn}
								max={todayInZone(zone)}
								onChange={(event) => setOccurredOn(event.target.value)}
								className="font-mono tabular-nums"
								required
							/>
							<p className="text-muted-foreground text-xs">
								The day it was received, in {zone}.
							</p>
						</Field>

						<Field>
							<FieldLabel htmlFor={noteId}>Note</FieldLabel>
							<Input
								id={noteId}
								value={note}
								onChange={(event) => setNote(event.target.value)}
								placeholder="What this entry is for"
								autoComplete="off"
							/>
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form="record-deposit"
						disabled={
							record.isPending ||
							typed === "" ||
							amountProblem !== null ||
							(corrects && correctsId === "")
						}
					>
						{record.isPending ? <Spinner /> : null}
						Record entry
					</Button>
					<SheetClose asChild>
						<Button variant="outline">Cancel</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
