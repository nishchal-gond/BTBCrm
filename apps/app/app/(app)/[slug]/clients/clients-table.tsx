"use client";

import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { ClientRef } from "@/components/crm/client-ref";
import {
	ClientStatusBadge,
	clientStatusLabel,
} from "@/components/crm/client-status";
import { OwnerName } from "@/components/crm/owner-name";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useBusinessLine } from "@/lib/use-business-line";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { ClientsEmpty, describeFilters } from "./clients-empty";
import {
	type CLIENT_VIEW_COPY,
	clientsSearchParams,
} from "./clients-search-params";
import { CreateClientSheet } from "./create-client-sheet";

type ClientRow = RouterOutputs["clients"]["list"]["rows"][number];
type ClientView = keyof typeof CLIENT_VIEW_COPY;

function ClientNameLink({ row }: { row: ClientRow }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<Link
			data-slot="client-link"
			href={workspaceUrl(`/clients/${row.clientRef}`)}
			className="truncate rounded-sm font-medium hover:underline"
			onClick={(event) => event.stopPropagation()}
		>
			{row.name}
		</Link>
	);
}

function ClientCard({ row }: { row: ClientRow }) {
	const workspaceUrl = useWorkspaceUrl();

	return (
		<div className="flex flex-col gap-2 px-4 py-3">
			<div className="flex items-center justify-between gap-3">
				<Link
					data-slot="client-link"
					href={workspaceUrl(`/clients/${row.clientRef}`)}
					className="min-w-0 rounded-sm font-medium text-sm hover:underline"
				>
					{row.name}
				</Link>
				<ClientStatusBadge status={row.status} />
			</div>
			<ClientRef value={row.clientRef} className="self-start" />
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
				<div className="flex gap-1">
					<dt className="text-muted-foreground">Sales</dt>
					<dd className="min-w-0">
						<OwnerName owner={row.salesOwner} />
					</dd>
				</div>
				<div className="flex gap-1">
					<dt className="text-muted-foreground">Mentor</dt>
					<dd className="min-w-0">
						<OwnerName owner={row.mentorOwner} />
					</dd>
				</div>
				<div className="col-span-2 flex gap-1">
					<dt className="text-muted-foreground">Last activity</dt>
					<dd className="text-muted-foreground">
						{row.lastActivityAt ? (
							<LocalRelativeTime date={row.lastActivityAt} />
						) : (
							<EmptyCellValue />
						)}
					</dd>
				</div>
			</dl>
		</div>
	);
}

const COLUMNS: DataTableColumn<ClientRow>[] = [
	{
		id: "clientRef",
		header: "Client ID",
		sortable: true,
		hideable: false,
		width: "w-[14%]",
		cell: (row) => <ClientRef value={row.clientRef} />,
	},
	{
		id: "name",
		header: "Name",
		sortable: true,
		hideable: false,
		width: "w-[20%]",
		cell: (row) => <ClientNameLink row={row} />,
	},
	{
		id: "status",
		header: "Status",
		sortable: true,
		width: "w-[18%]",
		cell: (row) => <ClientStatusBadge status={row.status} />,
	},
	{
		id: "salesOwner",
		header: "Sales owner",
		width: "w-[14%]",
		hideBelow: "md",
		cell: (row) => <OwnerName owner={row.salesOwner} />,
	},
	{
		id: "mentorOwner",
		header: "Mentor",
		width: "w-[14%]",
		hideBelow: "lg",
		cell: (row) => <OwnerName owner={row.mentorOwner} />,
	},
	{
		id: "email",
		header: "Email",
		width: "w-[18%]",
		hideBelow: "lg",
		defaultHidden: true,
		cell: (row) =>
			row.email ? (
				<span className="truncate text-muted-foreground">{row.email}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "lastActivityAt",
		header: "Last activity",
		sortable: true,
		align: "right",
		width: "w-[13%]",
		hideBelow: "sm",
		cell: (row) => (
			<span className="text-muted-foreground">
				{row.lastActivityAt ? (
					<LocalRelativeTime date={row.lastActivityAt} />
				) : (
					<EmptyCellValue />
				)}
			</span>
		),
	},
];

export function ClientsTable({ view }: { view: ClientView }) {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const table = useTableQuery(clientsSearchParams);
	const { query, input } = table;
	const [, setSearch] = useQueryState(
		SEARCH_PARAM.list.q,
		parseAsString.withDefault(""),
	);

	const [wanted] = useBusinessLine();
	const workspace = useQuery(
		trpc.clients.workspace.queryOptions({ vertical: wanted }),
	);
	const vertical = workspace.data?.vertical ?? wanted;

	const listInput = useMemo(
		() => ({
			q: input.q,
			sort: input.sort,
			dir: input.dir,
			page: input.page,
			pageSize: input.pageSize,
			vertical,
			view,
			status: input.status,
			salesOwner: input.salesOwner,
			mentorOwner: input.mentorOwner,
			source: [],
		}),
		[input, vertical, view],
	);

	const clients = useQuery({
		...trpc.clients.list.queryOptions(listInput),
		placeholderData: (previous) => previous,
	});
	const staff = useQuery(
		trpc.staff.directory.queryOptions({
			q: "",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 100,
			role: [],
			status: "active",
		}),
	);

	const rows = clients.data?.rows ?? [];
	const facetCounts = clients.data?.facetCounts;

	const people = staff.data?.rows ?? [];

	const ownerOptions = (side: "SALES" | "MENTOR") => [
		{ value: "unassigned", label: "Unassigned" },
		...people
			.filter((person) =>
				side === "SALES"
					? person.role === "SALES" || person.role === "SALES_MANAGER"
					: person.role === "MENTOR" || person.role === "MENTOR_MANAGER",
			)
			.map((person) => ({ value: person.userId, label: person.name })),
	];

	const facets: DataTableFacet[] = [
		{
			id: "status",
			label: "Status",
			options: (workspace.data?.statuses ?? []).map((status) => ({
				value: status,
				label: clientStatusLabel(status),
			})),
		},
		{
			id: "salesOwner",
			label: "Sales owner",
			options: ownerOptions("SALES"),
		},
		{
			id: "mentorOwner",
			label: "Mentor",
			options: ownerOptions("MENTOR"),
		},
	];

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search by name, client ID or email…" />}
			actions={
				workspace.data?.canCreate ? (
					<CreateClientSheet vertical={vertical} />
				) : null
			}
			columns={COLUMNS}
			rows={rows}
			total={clients.data?.total ?? 0}
			facetCounts={facetCounts}
			facets={facets}
			getRowId={(row) => row.id}
			rowLabel={(row) => `${row.name}, ${row.clientRef}`}
			loading={clients.isFetching}
			cards={(row) => <ClientCard row={row} />}
			onRowClick={(row) =>
				router.push(workspaceUrl(`/clients/${row.clientRef}`))
			}
			empty={
				<ClientsEmpty
					view={view}
					filters={describeFilters(query.filters, input.q)}
					onClear={() => {
						for (const id of ["status", "salesOwner", "mentorOwner"]) {
							query.setFilter(id, []);
						}
						setSearch("");
					}}
				/>
			}
		/>
	);
}
