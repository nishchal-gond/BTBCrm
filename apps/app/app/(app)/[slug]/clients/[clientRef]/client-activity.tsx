"use client";

import { useQuery } from "@tanstack/react-query";
import { clientStatusLabel } from "@/components/crm/client-status";
import { useTRPC } from "@/lib/trpc/client";
import { ClientMoment } from "./client-moment";

export function ClientActivity({ clientRef }: { clientRef: string }) {
	const trpc = useTRPC();
	const history = useQuery(trpc.clients.history.queryOptions({ clientRef }));

	if (history.isPending) {
		return (
			<p
				role="status"
				aria-busy="true"
				className="text-muted-foreground text-sm"
			>
				Loading the history…
			</p>
		);
	}

	const entries = history.data ?? [];

	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Nothing has moved yet.</p>
		);
	}

	return (
		<ol className="flex flex-col">
			{entries.map((entry) => (
				<li
					key={entry.id}
					className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-subtle border-b py-2 last:border-b-0"
				>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						<ClientMoment date={entry.changedAt} />
					</span>
					<span className="text-sm">
						{entry.fromStatus
							? `${clientStatusLabel(entry.fromStatus)} → ${clientStatusLabel(entry.toStatus)}`
							: `Entered as ${clientStatusLabel(entry.toStatus)}`}
					</span>
					<span className="text-muted-foreground text-xs">
						{entry.changedBy ? `by ${entry.changedBy.name}` : "by the system"}
					</span>
					{entry.reason ? (
						<span className="basis-full text-muted-foreground text-xs">
							{entry.reason}
						</span>
					) : null}
				</li>
			))}
		</ol>
	);
}
