import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellFallback,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CLIENT_VIEW_COPY, clientsSearchParams } from "./clients-search-params";
import { ClientsTable } from "./clients-table";

type ClientView = keyof typeof CLIENT_VIEW_COPY;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function ClientsView({
	view,
	searchParams,
}: {
	view: ClientView;
	searchParams: SearchParams;
}) {
	const copy = CLIENT_VIEW_COPY[view];

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{copy.title}</PageShellTitle>
					<PageShellDescription>{copy.description}</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellFallback />}>
					<Rows view={view} searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Rows({
	view,
	searchParams,
}: {
	view: ClientView;
	searchParams: SearchParams;
}) {
	const [, values] = await Promise.all([
		requireSession(),
		clientsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const workspace = await queryClient.fetchQuery(
		trpc.clients.workspace.queryOptions(),
	);

	const base = clientsSearchParams.toInput(values);

	await queryClient.prefetchQuery(
		trpc.clients.list.queryOptions({
			q: base.q,
			sort: base.sort,
			dir: base.dir,
			page: base.page,
			pageSize: base.pageSize,
			vertical: workspace.verticals[0] ?? "ACADEMY",
			view,
			status: base.status,
			salesOwner: base.salesOwner,
			mentorOwner: base.mentorOwner,
			source: [],
		}),
	);

	return (
		<HydrateClient>
			<ClientsTable view={view} />
		</HydrateClient>
	);
}
