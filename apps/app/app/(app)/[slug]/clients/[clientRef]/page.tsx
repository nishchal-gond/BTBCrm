import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShellFallback } from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ClientRecord } from "./client-record";

export async function generateMetadata({
	params,
}: PageProps<"/[slug]/clients/[clientRef]">): Promise<Metadata> {
	const { clientRef } = await params;
	return { title: clientRef };
}

export default function ClientPage({
	params,
}: PageProps<"/[slug]/clients/[clientRef]">) {
	return (
		<Suspense fallback={<PageShellFallback />}>
			<Record params={params} />
		</Suspense>
	);
}

async function Record({
	params,
}: Pick<PageProps<"/[slug]/clients/[clientRef]">, "params">) {
	const [, { clientRef }] = await Promise.all([requireSession(), params]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.clients.byRef.queryOptions({ clientRef })),
		queryClient.prefetchQuery(trpc.clients.history.queryOptions({ clientRef })),
	]);

	return (
		<HydrateClient>
			<ClientRecord clientRef={clientRef} />
		</HydrateClient>
	);
}
