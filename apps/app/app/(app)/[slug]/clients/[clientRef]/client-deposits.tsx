"use client";

import { Button } from "@crm/ui/components/button";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LedgerTotals } from "@/app/(app)/[slug]/deposits/ledger-totals";
import {
	DepositEntryBadge,
	VerifiedBadge,
} from "@/components/crm/deposit-entry";
import { Money } from "@/components/crm/money";
import { useTRPC } from "@/lib/trpc/client";
import { ClientMoment } from "./client-moment";
import { RecordDepositSheet } from "./record-deposit-sheet";

export function ClientDeposits({
	clientRef,
	canSeeMoney,
}: {
	clientRef: string;
	canSeeMoney: boolean;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const ledger = useQuery({
		...trpc.deposits.forClient.queryOptions({ clientRef }),
		enabled: canSeeMoney,
		retry: false,
	});

	const verify = useMutation(
		trpc.deposits.verify.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.deposits.forClient.queryKey({ clientRef }),
				});
				toast.success("Entry verified.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!canSeeMoney || ledger.isError) {
		return (
			<p className="text-muted-foreground text-sm">
				Money on this client is not yours to read.
			</p>
		);
	}

	if (ledger.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<span role="status" className="sr-only">
					Loading the ledger…
				</span>
				<Skeleton className="h-24 w-full rounded-lg" />
				<Skeleton className="h-4 w-80" />
				<Skeleton className="h-40 w-full rounded-lg" />
			</div>
		);
	}

	const { rows, totals, canRecord } = ledger.data;

	return (
		<div className="flex flex-col gap-4">
			<LedgerTotals totals={totals} compact />

			{canRecord ? (
				<div className="flex justify-end">
					<RecordDepositSheet clientRef={clientRef} />
				</div>
			) : null}

			<p className="text-muted-foreground text-xs">
				The total is derived from {totals.entryCount}{" "}
				{totals.entryCount === 1 ? "entry" : "entries"} below. Nothing stores
				it. A mistake is corrected with an adjustment, never by editing a line.
			</p>

			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No money recorded against this client yet.
				</p>
			) : (
				<ol className="flex flex-col rounded-lg border bg-card">
					{rows.map((row) => (
						<li
							key={row.id}
							className="flex flex-wrap items-center gap-x-4 gap-y-2 border-subtle border-b px-4 py-3 last:border-b-0"
						>
							<span className="font-mono text-muted-foreground text-xs tabular-nums">
								<ClientMoment date={row.occurredAt} />
							</span>
							<DepositEntryBadge entry={row.entryType} />
							<Money
								amount={row.amount}
								currency={row.currency}
								tone="signed"
							/>
							<span className="text-muted-foreground text-xs">
								{row.method ?? "Method not recorded"}
								{row.reference ? ` · ${row.reference}` : ""}
							</span>
							<span className="text-muted-foreground text-xs">
								by {row.recordedBy.name}
							</span>
							<span className="ms-auto">
								{row.canVerify ? (
									<Button
										variant="outline"
										size="xs"
										disabled={verify.isPending}
										onClick={() => verify.mutate({ id: row.id })}
									>
										Verify
									</Button>
								) : (
									<VerifiedBadge verified={row.verifiedAt !== null} />
								)}
							</span>
							{row.note ? (
								<span className="basis-full text-muted-foreground text-xs">
									{row.note}
								</span>
							) : null}
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
