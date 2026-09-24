"use client";

import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { toast } from "sonner";
import { ClientRef } from "@/components/crm/client-ref";
import {
	DepositEntryBadge,
	depositEntryLabel,
	VerifiedBadge,
} from "@/components/crm/deposit-entry";
import { Money } from "@/components/crm/money";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { DepositsEmpty, describeLedgerFilters } from "./deposits-empty";
import { depositsSearchParams } from "./deposits-search-params";
import { LedgerTotals } from "./ledger-totals";

type DepositRow = RouterOutputs["deposits"]["list"]["rows"][number];

const EMPTY = {
	total: "0.00",
	verified: "0.00",
	pending: "0.00",
	currency: "AED",
	paymentCount: 0,
	entryCount: 0,
	lastDepositAt: null,
};

function ClientCell({ row }: { row: DepositRow }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<span className="flex min-w-0 flex-col">
			<Link
				data-slot="client-link"
				href={workspaceUrl(`/clients/${row.clientRef}`)}
				className="truncate rounded-sm font-medium hover:underline"
			>
				{row.clientName}
			</Link>
			<ClientRef value={row.clientRef} className="text-xs" />
		</span>
	);
}

function VerifyButton({ row }: { row: DepositRow }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const verify = useMutation(
		trpc.deposits.verify.mutationOptions({
			onSuccess: async (entry) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.deposits.list.queryKey(),
				});
				toast.success(`${entry.clientRef} entry verified.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!row.canVerify)
		return <VerifiedBadge verified={row.verifiedAt !== null} />;

	return (
		<Button
			variant="outline"
			size="xs"
			disabled={verify.isPending}
			onClick={(event) => {
				event.stopPropagation();
				verify.mutate({ id: row.id });
			}}
		>
			Verify
		</Button>
	);
}

const COLUMNS: DataTableColumn<DepositRow>[] = [
	{
		id: "occurredAt",
		header: "Date",
		sortable: true,
		hideable: false,
		width: "w-[14%]",
		cell: (row) => (
			<span className="font-mono text-muted-foreground text-xs tabular-nums">
				<LocalRelativeTime date={row.occurredAt} />
			</span>
		),
	},
	{
		id: "client",
		header: "Client",
		sortable: true,
		hideable: false,
		width: "w-[24%]",
		cell: (row) => <ClientCell row={row} />,
	},
	{
		id: "entryType",
		header: "Entry",
		sortable: true,
		width: "w-[14%]",
		cell: (row) => <DepositEntryBadge entry={row.entryType} />,
	},
	{
		id: "amount",
		header: "Amount",
		sortable: true,
		align: "right",
		width: "w-[16%]",
		cell: (row) => (
			<Money amount={row.amount} currency={row.currency} tone="signed" />
		),
	},
	{
		id: "method",
		header: "Method",
		width: "w-[13%]",
		hideBelow: "lg",
		cell: (row) =>
			row.method ? (
				<span className="truncate text-muted-foreground">{row.method}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "reference",
		header: "Reference",
		width: "w-[12%]",
		hideBelow: "lg",
		defaultHidden: true,
		cell: (row) =>
			row.reference ? (
				<span className="truncate font-mono text-muted-foreground text-xs">
					{row.reference}
				</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "recordedBy",
		header: "Recorded by",
		width: "w-[12%]",
		hideBelow: "md",
		cell: (row) => <span className="truncate">{row.recordedBy.name}</span>,
	},
	{
		id: "verified",
		header: "Verified",
		align: "right",
		width: "w-[12%]",
		cell: (row) => <VerifyButton row={row} />,
	},
];

function DepositCard({ row }: { row: DepositRow }) {
	return (
		<div className="flex flex-col gap-2 px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<ClientCell row={row} />
				<Money amount={row.amount} currency={row.currency} tone="signed" />
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<DepositEntryBadge entry={row.entryType} />
				<VerifyButton row={row} />
			</div>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
				<div className="flex gap-1">
					<dt className="text-muted-foreground">Date</dt>
					<dd className="font-mono tabular-nums">
						<LocalRelativeTime date={row.occurredAt} />
					</dd>
				</div>
				<div className="flex gap-1">
					<dt className="text-muted-foreground">By</dt>
					<dd className="min-w-0 truncate">{row.recordedBy.name}</dd>
				</div>
			</dl>
		</div>
	);
}

export function DepositsTable() {
	const trpc = useTRPC();
	const table = useTableQuery(depositsSearchParams);
	const { query, input } = table;
	const [, setSearch] = useQueryState(
		SEARCH_PARAM.list.q,
		parseAsString.withDefault(""),
	);

	const workspace = useQuery(trpc.clients.workspace.queryOptions());
	const vertical = workspace.data?.verticals[0] ?? "ACADEMY";

	const listInput = useMemo(
		() => ({
			q: input.q,
			sort: input.sort,
			dir: input.dir,
			page: input.page,
			pageSize: input.pageSize,
			vertical,
			entryType: input.entryType,
			verified: input.verified,
			recordedBy: input.recordedBy,
		}),
		[input, vertical],
	);

	const ledger = useQuery({
		...trpc.deposits.list.queryOptions(listInput),
		placeholderData: (previous) => previous,
	});

	const rows = ledger.data?.rows ?? [];
	const facetCounts = ledger.data?.facetCounts;

	const facets: DataTableFacet[] = [
		{
			id: "entryType",
			label: "Entry",
			options: (["PAYMENT", "REFUND", "ADJUSTMENT"] as const)
				.map((value) => ({ value, label: depositEntryLabel(value) }))
				.filter((option) => (facetCounts?.entryType?.[option.value] ?? 0) > 0),
		},
		{
			id: "verified",
			label: "Verified",
			options: [
				{ value: "verified", label: "Verified" },
				{ value: "pending", label: "Pending" },
			],
		},
	];

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<LedgerTotals
				totals={ledger.data?.totals ?? EMPTY}
				filter={input.verified}
				onFilter={(next) => query.setFilter("verified", next)}
			/>

			<DataTable
				className="min-h-0 flex-1"
				query={query}
				search={
					<ListSearch placeholder="Search by client, reference or method…" />
				}
				columns={COLUMNS}
				rows={rows}
				total={ledger.data?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				cards={(row) => <DepositCard row={row} />}
				getRowId={(row) => row.id}
				loading={ledger.isFetching}
				empty={
					<DepositsEmpty
						filters={describeLedgerFilters(query.filters, input.q)}
						onClear={() => {
							for (const id of ["entryType", "verified", "recordedBy"]) {
								query.setFilter(id, []);
							}
							setSearch("");
						}}
					/>
				}
			/>
		</div>
	);
}
