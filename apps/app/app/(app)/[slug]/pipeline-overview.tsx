"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Calendar from "@carbon/icons-react/es/Calendar";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { KpiCell, KpiRail, KpiValue } from "@crm/ui/components/kpi-rail";
import { shortMoment } from "@crm/validation/zoned-time";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ClientStatusBadge } from "@/components/crm/client-status";
import { EventTypeBadge } from "@/components/crm/event-type";
import { Money } from "@/components/crm/money";
import { PageNotice } from "@/components/page-notice";
import { QueryError } from "@/components/query-error";
import { ListFallback } from "@/components/skeletons";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useBusinessLine } from "@/lib/use-business-line";
import { useViewerZone } from "@/lib/use-viewer-zone";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Overview = RouterOutputs["overview"]["summary"];

const SCOPE_NOTE = {
	company: "across the company",
	team: "across your team",
	own: "on your own book",
} as const;

function Moment({ startsAt, zone }: { startsAt: string; zone: string }) {
	return (
		<span className="font-mono text-muted-foreground text-xs tabular-nums">
			{shortMoment(new Date(startsAt), zone)}
		</span>
	);
}

function Panel({
	title,
	action,
	children,
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="flex min-w-0 flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="font-medium text-sm">{title}</h2>
				{action}
			</div>
			{children}
		</section>
	);
}

function Attention({
	rows,
	workspaceUrl,
}: {
	rows: Overview["attention"];
	workspaceUrl: (path: string) => string;
}) {
	if (rows.length === 0) {
		return (
			<PageNotice icon={WarningAlt} title="Nothing is waiting on you">
				No unowned people, no stale leads, nothing unverified.
			</PageNotice>
		);
	}

	return (
		<ul className="flex flex-col rounded-lg border bg-card">
			{rows.map((row) => (
				<li
					key={row.kind}
					className="flex items-center gap-3 border-subtle border-b px-4 py-3 last:border-b-0"
				>
					<span className="font-mono font-semibold text-lg tabular-nums">
						{row.count}
					</span>
					<span className="min-w-0 flex-1 text-sm">{row.label}</span>
					{row.href ? (
						<Button asChild variant="ghost" size="sm">
							<Link href={workspaceUrl(row.href)}>
								Open
								<Icon icon={ArrowRight} data-icon="inline-end" />
							</Link>
						</Button>
					) : null}
				</li>
			))}
		</ul>
	);
}

export function PipelineOverview() {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const zone = useViewerZone();
	const [wanted] = useBusinessLine();

	const overview = useQuery({
		...trpc.overview.summary.queryOptions({ vertical: wanted }),
		retry: false,
	});

	if (overview.isError) {
		return (
			<QueryError
				title="The overview did not load"
				message={overview.error.message}
				onRetry={() => void overview.refetch()}
				retrying={overview.isFetching}
			/>
		);
	}

	if (overview.isPending) return <ListFallback rows={5} />;

	const data = overview.data;
	const note = SCOPE_NOTE[data.scope];

	return (
		<div className="flex flex-col gap-6">
			<KpiRail label="The book at a glance" columns={4}>
				<KpiCell label="In the pipeline" note={`Not yet converted, ${note}`}>
					<KpiValue>{data.openPipeline}</KpiValue>
				</KpiCell>
				<KpiCell label="Converted this month" note="Closed since the 1st">
					<KpiValue>{data.convertedThisMonth}</KpiValue>
				</KpiCell>
				<KpiCell label="Studying now" note="Enrolments running today">
					<KpiValue>{data.activeStudents}</KpiValue>
				</KpiCell>
				{data.money ? (
					<KpiCell
						label="Taken this month"
						note={`${data.money.entryCount} ${data.money.entryCount === 1 ? "entry" : "entries"}, derived`}
					>
						<Money
							amount={data.money.thisMonth}
							currency={data.money.currency}
							className="font-semibold text-lg lg:text-xl"
						/>
					</KpiCell>
				) : (
					<KpiCell
						label="Money"
						note="A mentor sees the client, never the money"
					>
						<KpiValue className="text-muted-foreground">—</KpiValue>
					</KpiCell>
				)}
			</KpiRail>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Panel
					title="Needs you"
					action={
						<Button asChild variant="ghost" size="sm">
							<Link href={workspaceUrl("/clients")}>All clients</Link>
						</Button>
					}
				>
					<Attention rows={data.attention} workspaceUrl={workspaceUrl} />
				</Panel>

				<Panel title="Coming up">
					{data.next.length === 0 ? (
						<PageNotice icon={Calendar} title="Nothing booked">
							Bookings you organise or are invited to appear here.
						</PageNotice>
					) : (
						<ul className="flex flex-col rounded-lg border bg-card">
							{data.next.map((event) => (
								<li
									key={event.id}
									className="flex flex-col gap-1 border-subtle border-b px-4 py-3 last:border-b-0"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="min-w-0 truncate font-medium text-sm">
											{event.title}
										</span>
										<Moment startsAt={event.startsAt} zone={zone} />
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<EventTypeBadge
											type={
												event.eventType as Parameters<
													typeof EventTypeBadge
												>[0]["type"]
											}
										/>
										{event.clientRef ? (
											<Link
												data-slot="client-link"
												href={workspaceUrl(`/clients/${event.clientRef}`)}
												className="truncate text-muted-foreground text-xs hover:text-foreground hover:underline"
											>
												{event.clientName} · {event.clientRef}
											</Link>
										) : null}
									</div>
								</li>
							))}
						</ul>
					)}
				</Panel>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Panel title="Where everybody is">
					{data.pipeline.length === 0 ? (
						<PageNotice icon={ArrowRight} title="Nobody on the book yet">
							People appear here as soon as somebody enters them.
						</PageNotice>
					) : (
						<ul className="flex flex-col rounded-lg border bg-card">
							{data.pipeline.map((row) => (
								<li
									key={row.status}
									className="flex items-center gap-3 border-subtle border-b px-4 py-2.5 last:border-b-0"
								>
									<ClientStatusBadge status={row.status} />
									<span className="ms-auto font-mono text-sm tabular-nums">
										{row.count}
									</span>
								</li>
							))}
						</ul>
					)}
				</Panel>

				<Panel title="Latest moves">
					{data.recent.length === 0 ? (
						<PageNotice icon={ArrowRight} title="No movement yet">
							Every status change lands here, with who made it.
						</PageNotice>
					) : (
						<ul className="flex flex-col rounded-lg border bg-card">
							{data.recent.map((row) => (
								<li
									key={row.id}
									className="flex flex-wrap items-center gap-x-3 gap-y-1 border-subtle border-b px-4 py-2.5 last:border-b-0"
								>
									<Link
										data-slot="client-link"
										href={workspaceUrl(`/clients/${row.clientRef}`)}
										className="min-w-0 truncate text-sm hover:underline"
									>
										{row.clientName}
									</Link>
									<ClientStatusBadge status={row.toStatus} />
									<span className="ms-auto text-muted-foreground text-xs">
										{row.changedBy ?? "the system"}
									</span>
								</li>
							))}
						</ul>
					)}
				</Panel>
			</div>
		</div>
	);
}
