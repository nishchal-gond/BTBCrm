import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { ListFallback } from "@/components/skeletons";
import { BUSINESS_LINES, readBusinessLine } from "@/lib/business-line";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { PipelineOverview } from "./pipeline-overview";

export const instant = false;

export default function OverviewPage({ searchParams }: PageProps<"/[slug]">) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Today</PageShellTitle>
					<PageShellDescription>
						Where the book stands, what is waiting on you, and what is booked
						next.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<ListFallback rows={5} />}>
					<Summary searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Summary({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	await requireSession();

	const wanted = readBusinessLine(await searchParams, BUSINESS_LINES);
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		getServerTrpc().overview.summary.queryOptions({ vertical: wanted }),
	);

	return (
		<HydrateClient>
			<PipelineOverview />
		</HydrateClient>
	);
}
