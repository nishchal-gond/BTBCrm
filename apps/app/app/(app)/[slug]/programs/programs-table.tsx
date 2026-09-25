"use client";

import { Button } from "@crm/ui/components/button";
import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { StatusBadge } from "@crm/ui/components/status-badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { toast } from "sonner";
import { Money } from "@/components/crm/money";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { EditProgramSheet, NewProgramSheet } from "./program-sheet";
import { ProgramsEmpty } from "./programs-empty";
import { programsSearchParams } from "./programs-search-params";

type Program = RouterOutputs["programs"]["list"]["rows"][number];

function RetireButton({ program }: { program: Program }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const update = useMutation(
		trpc.programs.update.mutationOptions({
			onSuccess: async (next) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.programs.list.queryKey(),
				});
				toast.success(
					`${next.code} ${next.isActive ? "runs again" : "is retired"}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Button
			variant="outline"
			size="xs"
			disabled={update.isPending}
			onClick={() =>
				update.mutate({ id: program.id, isActive: !program.isActive })
			}
		>
			{program.isActive ? "Retire" : "Reinstate"}
		</Button>
	);
}

function ManageCell({
	program,
	canManage,
}: {
	program: Program;
	canManage: boolean;
}) {
	if (!canManage) return <EmptyCellValue />;

	return (
		<span className="flex justify-end gap-2">
			<EditProgramSheet program={program} />
			<RetireButton program={program} />
		</span>
	);
}

function columnsFor(canManage: boolean): DataTableColumn<Program>[] {
	return [
		{
			id: "code",
			header: "Code",
			sortable: true,
			hideable: false,
			width: "w-[16%]",
			cell: (row) => (
				<span className="font-mono text-sm tabular-nums">{row.code}</span>
			),
		},
		{
			id: "name",
			header: "Name",
			sortable: true,
			hideable: false,
			width: "w-[24%]",
			cell: (row) => <span className="truncate font-medium">{row.name}</span>,
		},
		{
			id: "durationWeeks",
			header: "Weeks",
			sortable: true,
			align: "right",
			width: "w-[10%]",
			cell: (row) => (
				<span className="font-mono text-sm tabular-nums">
					{row.durationWeeks}
				</span>
			),
		},
		{
			id: "priceAed",
			header: "Price",
			sortable: true,
			align: "right",
			width: "w-[16%]",
			cell: (row) => <Money amount={row.priceAed} currency="AED" />,
		},
		{
			id: "students",
			header: "On it now",
			align: "right",
			width: "w-[12%]",
			hideBelow: "md",
			cell: (row) => (
				<span className="font-mono text-sm tabular-nums">
					{row.activeEnrollments}
				</span>
			),
		},
		{
			id: "isActive",
			header: "Status",
			width: "w-[10%]",
			cell: (row) => (
				<StatusBadge tone={row.isActive ? "positive" : "neutral"}>
					{row.isActive ? "Running" : "Retired"}
				</StatusBadge>
			),
		},
		{
			id: "manage",
			header: "",
			align: "right",
			width: "w-[12%]",
			hideable: false,
			cell: (row) => <ManageCell program={row} canManage={canManage} />,
		},
	];
}

function ProgramCard({
	program,
	canManage,
}: {
	program: Program;
	canManage: boolean;
}) {
	return (
		<div className="flex flex-col gap-2 px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<span className="min-w-0 font-medium text-sm">{program.name}</span>
				<StatusBadge tone={program.isActive ? "positive" : "neutral"}>
					{program.isActive ? "Running" : "Retired"}
				</StatusBadge>
			</div>
			<span className="font-mono text-muted-foreground text-xs">
				{program.code}
			</span>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
				<div className="flex gap-1">
					<dt className="text-muted-foreground">Price</dt>
					<dd>
						<Money
							amount={program.priceAed}
							currency="AED"
							className="text-xs"
						/>
					</dd>
				</div>
				<div className="flex gap-1">
					<dt className="text-muted-foreground">Weeks</dt>
					<dd className="font-mono tabular-nums">{program.durationWeeks}</dd>
				</div>
				<div className="col-span-2 flex gap-1">
					<dt className="text-muted-foreground">On it now</dt>
					<dd className="font-mono tabular-nums">
						{program.activeEnrollments}
					</dd>
				</div>
			</dl>
			{canManage ? (
				<div className="flex gap-2">
					<EditProgramSheet program={program} />
					<RetireButton program={program} />
				</div>
			) : null}
		</div>
	);
}

export function ProgramsTable() {
	const trpc = useTRPC();
	const table = useTableQuery(programsSearchParams);
	const { query, input } = table;

	const [, setSearch] = useQueryState(
		SEARCH_PARAM.list.q,
		parseAsString.withDefault(""),
	);
	const workspace = useQuery(trpc.programs.workspace.queryOptions());
	const canManage = workspace.data?.canManagePrograms ?? false;

	const listInput = useMemo(
		() => ({
			q: input.q,
			sort: input.sort,
			dir: input.dir,
			page: input.page,
			pageSize: input.pageSize,
			status: input.status as "active" | "retired" | "all",
		}),
		[input],
	);

	const programs = useQuery({
		...trpc.programs.list.queryOptions(listInput),
		placeholderData: (previous) => previous,
	});

	const rows = programs.data?.rows ?? [];
	const columns = useMemo(() => columnsFor(canManage), [canManage]);

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search by code or name…" />}
			actions={canManage ? <NewProgramSheet /> : null}
			tabs={{
				id: "status",
				options: [
					{ value: "active", label: "Running" },
					{ value: "retired", label: "Retired" },
				],
			}}
			columns={columns}
			rows={rows}
			total={programs.data?.total ?? 0}
			facetCounts={programs.data?.facetCounts}
			cards={(row) => <ProgramCard program={row} canManage={canManage} />}
			getRowId={(row) => row.id}
			loading={programs.isFetching}
			empty={
				<ProgramsEmpty
					status={input.status}
					search={input.q}
					onClear={() => setSearch("")}
				/>
			}
		/>
	);
}
