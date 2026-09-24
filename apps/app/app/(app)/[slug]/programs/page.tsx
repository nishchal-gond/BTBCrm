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
import { programsSearchParams } from "./programs-search-params";
import { ProgramsTable } from "./programs-table";

export const metadata: Metadata = {
	title: "Programs",
};

export default function ProgramsPage({
	searchParams,
}: PageProps<"/[slug]/programs">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Programmes</PageShellTitle>
					<PageShellDescription>
						What a student enrols on. Retiring one keeps its history.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellFallback />}>
					<Catalogue searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Catalogue({
	searchParams,
}: Pick<PageProps<"/[slug]/programs">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		programsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const base = programsSearchParams.toInput(values);

	await Promise.all([
		queryClient.prefetchQuery(trpc.programs.workspace.queryOptions()),
		queryClient.prefetchQuery(
			trpc.programs.list.queryOptions({
				q: base.q,
				sort: base.sort,
				dir: base.dir,
				page: base.page,
				pageSize: base.pageSize,
				status: base.status as "active" | "retired" | "all",
			}),
		),
	]);

	return (
		<HydrateClient>
			<ProgramsTable />
		</HydrateClient>
	);
}
