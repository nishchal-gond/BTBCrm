"use client";

import { Button } from "@crm/ui/components/button";
import { Skeleton } from "@crm/ui/components/skeleton";
import type { StatusTone } from "@crm/ui/components/status-badge";
import { StatusBadge } from "@crm/ui/components/status-badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CompanyMoment } from "./client-moment";
import { EnrollSheet } from "./enroll-sheet";
import { Fact, Facts } from "./facts";

type Enrollment = RouterOutputs["programs"]["forClient"]["rows"][number];
type EnrollmentStatus = Enrollment["status"];

const LABELS = {
	ACTIVE: "Active",
	PAUSED: "Paused",
	COMPLETED: "Completed",
	WITHDRAWN: "Withdrawn",
} as const satisfies Record<EnrollmentStatus, string>;

const TONES = {
	ACTIVE: "positive",
	PAUSED: "warning",
	COMPLETED: "positive",
	WITHDRAWN: "neutral",
} as const satisfies Record<EnrollmentStatus, StatusTone>;

function Progress({ percent }: { percent: number }) {
	return (
		<span className="flex items-center gap-2">
			<span
				aria-hidden="true"
				className="h-1 w-24 overflow-hidden rounded-sm bg-surface-hover"
			>
				<span
					className="block h-full bg-accent"
					style={{ width: `${percent}%` }}
				/>
			</span>
			<span className="font-mono text-sm tabular-nums">{percent}%</span>
		</span>
	);
}

function MoveButtons({ enrollment }: { enrollment: Enrollment }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const move = useMutation(
		trpc.programs.move.mutationOptions({
			onSuccess: async (next) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.programs.forClient.queryKey({
						clientRef: next.clientRef,
					}),
				});
				await queryClient.invalidateQueries({
					queryKey: trpc.clients.byRef.queryKey({
						clientRef: next.clientRef,
					}),
				});
				toast.success(
					`${next.program.code} ${LABELS[next.status].toLowerCase()}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!enrollment.canManage) return null;

	return (
		<span className="flex flex-wrap gap-2">
			{enrollment.status === "ACTIVE" ? (
				<Button
					variant="outline"
					size="xs"
					disabled={move.isPending}
					onClick={() =>
						move.mutate({ id: enrollment.id, status: "PAUSED", notes: null })
					}
				>
					Pause
				</Button>
			) : (
				<Button
					variant="outline"
					size="xs"
					disabled={move.isPending}
					onClick={() =>
						move.mutate({ id: enrollment.id, status: "ACTIVE", notes: null })
					}
				>
					Resume
				</Button>
			)}
			<Button
				variant="outline"
				size="xs"
				disabled={move.isPending}
				onClick={() =>
					move.mutate({ id: enrollment.id, status: "COMPLETED", notes: null })
				}
			>
				Mark completed
			</Button>
			<Button
				variant="outline"
				size="xs"
				disabled={move.isPending}
				onClick={() =>
					move.mutate({ id: enrollment.id, status: "WITHDRAWN", notes: null })
				}
			>
				Withdraw
			</Button>
		</span>
	);
}

export function ClientEnrollment({
	clientRef,
	clientName,
	converted,
}: {
	clientRef: string;
	clientName: string;
	converted: boolean;
}) {
	const trpc = useTRPC();
	const enrollments = useQuery({
		...trpc.programs.forClient.queryOptions({ clientRef }),
		retry: false,
	});

	if (enrollments.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<span role="status" className="sr-only">
					Loading the enrolment…
				</span>
				<Skeleton className="h-32 w-full rounded-lg" />
				<Skeleton className="h-24 w-full rounded-lg" />
			</div>
		);
	}

	if (enrollments.isError) {
		return (
			<p className="text-muted-foreground text-sm">
				This client's enrolment is not yours to read.
			</p>
		);
	}

	const { rows, active, canEnroll } = enrollments.data;
	const history = rows.filter((row) => row.id !== active?.id);
	const paused = active?.status === "PAUSED";

	return (
		<div className="flex flex-col gap-6">
			{active ? (
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="flex flex-wrap items-center gap-3">
							<span className="font-mono text-sm">{active.program.code}</span>
							<span className="font-medium text-sm">{active.program.name}</span>
							<StatusBadge tone={TONES[active.status]}>
								{LABELS[active.status]}
							</StatusBadge>
						</span>
						<MoveButtons enrollment={active} />
					</div>

					<Facts>
						<Fact label="Mentor">{active.mentor?.name ?? null}</Fact>
						<Fact label="Cohort">{active.cohort}</Fact>
						<Fact label="Progress">
							<Progress percent={active.progressPercent} />
						</Fact>
						<Fact label="Running">
							{paused ? "Paused; the programme is on hold" : "Yes"}
						</Fact>
						<Fact label="Week" numeric>
							{`${active.weeksElapsed} of ${active.program.durationWeeks}`}
						</Fact>
						<Fact label="Enrolled" numeric>
							<CompanyMoment date={active.enrolledAt} />
						</Fact>
						<Fact label="Enrolled by">{active.createdBy?.name ?? null}</Fact>
					</Facts>

					{active.notes ? (
						<p className="text-muted-foreground text-sm">{active.notes}</p>
					) : null}
				</div>
			) : (
				<div className="flex flex-col items-start gap-3">
					<p className="text-muted-foreground text-sm">
						{converted
							? `${clientName} is not on a programme right now.`
							: `Nothing here until ${clientName} converts. The tab stays so the path is visible.`}
					</p>
					{canEnroll ? <EnrollSheet clientRef={clientRef} /> : null}
				</div>
			)}

			{history.length > 0 ? (
				<section className="flex flex-col gap-2">
					<h2 className="font-medium text-2xs text-muted-foreground uppercase tracking-label">
						Earlier programmes
					</h2>
					<ol className="flex flex-col rounded-lg border bg-card">
						{history.map((row) => (
							<li
								key={row.id}
								className="flex flex-wrap items-center gap-x-4 gap-y-2 border-subtle border-b px-4 py-3 last:border-b-0"
							>
								<span className="font-mono text-sm sm:w-32 sm:shrink-0">
									{row.program.code}
								</span>
								<span className="sm:w-28 sm:shrink-0">
									<StatusBadge tone={TONES[row.status]}>
										{LABELS[row.status]}
									</StatusBadge>
								</span>
								<span className="font-mono text-muted-foreground text-xs tabular-nums">
									<CompanyMoment date={row.enrolledAt} />
								</span>
								{row.completedAt ? (
									<span className="font-mono text-muted-foreground text-xs tabular-nums">
										finished <CompanyMoment date={row.completedAt} />
									</span>
								) : null}
								<span className="font-mono text-sm tabular-nums sm:w-20 sm:shrink-0 sm:text-right">
									{row.progressPercent}%
								</span>
								<span className="text-muted-foreground text-xs">
									{row.mentor ? `mentor ${row.mentor.name}` : "no mentor"}
								</span>
							</li>
						))}
					</ol>
				</section>
			) : null}

			<p className="text-muted-foreground text-xs">
				One running enrolment at a time. Finishing or withdrawing one keeps it
				here as history and frees the student to enrol again.
			</p>
		</div>
	);
}
