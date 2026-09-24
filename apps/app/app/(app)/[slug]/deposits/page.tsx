import type { Metadata } from "next";
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
import { depositsSearchParams } from "./deposits-search-params";
import { DepositsTable } from "./deposits-table";

export const metadata: Metadata = {
	title: "Deposits",
};

export default function DepositsPage({
	searchParams,
}: PageProps<"/[slug]/deposits">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Deposits</PageShellTitle>
					<PageShellDescription>
						Every entry, in order. Totals are derived from these lines, never
						stored.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellFallback />}>
					<Ledger searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Ledger({
	searchParams,
}: Pick<PageProps<"/[slug]/deposits">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		depositsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const workspace = await queryClient.fetchQuery(
		trpc.clients.workspace.queryOptions(),
	);

	const base = depositsSearchParams.toInput(values);

	await queryClient.prefetchQuery(
		trpc.deposits.list.queryOptions({
			q: base.q,
			sort: base.sort,
			dir: base.dir,
			page: base.page,
			pageSize: base.pageSize,
			vertical: workspace.verticals[0] ?? "ACADEMY",
			entryType: base.entryType,
			verified: base.verified,
			recordedBy: base.recordedBy,
		}),
	);

	return (
		<HydrateClient>
			<DepositsTable />
		</HydrateClient>
	);
}
