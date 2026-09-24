"use client";

import { Button } from "@crm/ui/components/button";
import { Separator } from "@crm/ui/components/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ClientRef } from "@/components/crm/client-ref";
import { ClientStatusBadge } from "@/components/crm/client-status";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
} from "@/components/page-shell";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { ClientActions } from "./client-actions";
import { ClientActivity } from "./client-activity";
import { ClientDeposits } from "./client-deposits";
import { ClientEnrollment } from "./client-enrollment";
import { ClientMoment } from "./client-moment";
import { Fact, Facts } from "./facts";
import { ClientNotFound } from "./not-found-state";

export function ClientRecord({ clientRef }: { clientRef: string }) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();

	const client = useQuery({
		...trpc.clients.byRef.queryOptions({ clientRef }),
		retry: false,
	});

	if (client.isError) {
		return <ClientNotFound backTo={workspaceUrl("/clients")} />;
	}

	const row = client.data;

	if (!row) {
		return (
			<div
				role="status"
				aria-busy="true"
				className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm"
			>
				Loading {clientRef}…
			</div>
		);
	}

	const converted = row.convertedAt !== null;

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<div className="flex min-w-0 flex-col gap-1 sm:col-start-1 sm:row-start-1">
						<div className="flex flex-wrap items-center gap-3">
							<h1 className="font-semibold text-lg tracking-tight">
								{row.name}
							</h1>
							<ClientStatusBadge status={row.status} />
						</div>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
							<ClientRef value={row.clientRef} />
							<span>Sales owner: {row.salesOwner?.name ?? "Unassigned"}</span>
							<span>Mentor: {row.mentorOwner?.name ?? "Unassigned"}</span>
						</div>
					</div>
				</PageShellHeading>
				<PageShellActions>
					<Button asChild variant="ghost" size="sm">
						<Link href={workspaceUrl("/clients")}>All clients</Link>
					</Button>
					<ClientActions client={row} />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Tabs defaultValue="overview">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="sales">Sales</TabsTrigger>
						<TabsTrigger value="student">Student</TabsTrigger>
						<TabsTrigger value="deposits">Deposits</TabsTrigger>
						<TabsTrigger value="activity">Activity</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="pt-4">
						<Facts>
							<Fact label="Client ID">
								<ClientRef value={row.clientRef} />
							</Fact>
							<Fact label="Business line">
								{row.vertical === "ACADEMY" ? "Trading Academy" : "Real Estate"}
							</Fact>
							<Fact label="Email">{row.email}</Fact>
							<Fact label="Phone" numeric>
								{row.phone}
							</Fact>
							<Fact label="City">{row.city}</Fact>
							<Fact label="Country">{row.country}</Fact>
							<Fact label="Entered by">
								{row.createdBy ? (
									<>
										{row.createdBy.name} · <ClientMoment date={row.createdAt} />
									</>
								) : null}
							</Fact>
							<Fact label="Last activity" numeric>
								{row.lastActivityAt ? (
									<ClientMoment date={row.lastActivityAt} />
								) : null}
							</Fact>
						</Facts>
					</TabsContent>

					<TabsContent value="sales" className="pt-4">
						<Facts>
							<Fact label="Source">{row.source}</Fact>
							<Fact label="Sales owner">{row.salesOwner?.name ?? null}</Fact>
							<Fact label="Entered by">{row.createdBy?.name ?? null}</Fact>
							<Fact label="Converted by">{row.convertedBy?.name ?? null}</Fact>
							<Fact label="Converted at" numeric>
								{row.convertedAt ? (
									<ClientMoment date={row.convertedAt} />
								) : null}
							</Fact>
						</Facts>
						<Separator className="my-4" />
						<p className="text-muted-foreground text-xs">
							Conversion never makes a second record. {row.clientRef} stays{" "}
							{row.clientRef} for life, and the person who entered them keeps
							the credit.
						</p>
					</TabsContent>

					<TabsContent value="student" className="pt-4">
						<ClientEnrollment
							clientRef={row.clientRef}
							clientName={row.name}
							converted={converted}
						/>
					</TabsContent>

					<TabsContent value="deposits" className="pt-4">
						<ClientDeposits
							clientRef={row.clientRef}
							canSeeMoney={row.canSeeMoney}
						/>
					</TabsContent>

					<TabsContent value="activity" className="pt-4">
						<ClientActivity clientRef={row.clientRef} />
					</TabsContent>
				</Tabs>
			</PageShellContent>
		</PageShell>
	);
}
