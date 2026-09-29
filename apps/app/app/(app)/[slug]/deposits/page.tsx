import Money from "@carbon/icons-react/es/Money";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageNotice } from "@/components/page-notice";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { TableFallback } from "@/components/skeletons";
import { BUSINESS_LINES, readBusinessLine } from "@/lib/business-line";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { depositsSearchParams } from "./deposits-search-params";
import { DepositsTable } from "./deposits-table";

export const instant = false;

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
				<Suspense fallback={<TableFallback />}>
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

	const me = await queryClient.fetchQuery(trpc.staff.me.queryOptions());

	if (!me.capabilities.includes("deposits.view")) {
		return (
			<PageNotice icon={Money} title="Deposits are not yours to read">
				A mentor sees the client and never the money. Ask an administrator if
				you need the ledger.
			</PageNotice>
		);
	}

	const wanted = readBusinessLine(await searchParams, BUSINESS_LINES);

	const workspace = await queryClient.fetchQuery(
		trpc.clients.workspace.queryOptions({ vertical: wanted }),
	);

	const base = depositsSearchParams.toInput(values);

	await queryClient.prefetchQuery(
		trpc.deposits.list.queryOptions({
			q: base.q,
			sort: base.sort,
			dir: base.dir,
			page: base.page,
			pageSize: base.pageSize,
			vertical: workspace.vertical,
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
