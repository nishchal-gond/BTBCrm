import { Skeleton } from "@crm/ui/components/skeleton";
import { cn } from "@crm/ui/lib/utils";
import {
	PageShell,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
} from "@/components/page-shell";

function bones(prefix: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function Busy({ label }: { label: string }) {
	return (
		<span role="status" className="sr-only">
			{label}
		</span>
	);
}

function HeaderBones({ withActions = true }: { withActions?: boolean }) {
	return (
		<PageShellHeader>
			<PageShellHeading>
				<Skeleton className="h-6 w-40 max-w-full sm:col-start-1 sm:row-start-1" />
				<Skeleton className="col-span-full row-start-2 h-4 w-72 max-w-full" />
			</PageShellHeading>
			{withActions ? (
				<div className="flex gap-2 sm:col-start-2 sm:row-start-1 sm:justify-self-end">
					<Skeleton className="h-8 w-24" />
				</div>
			) : null}
		</PageShellHeader>
	);
}

export function TableRowsBones({ rows = 8 }: { rows?: number }) {
	return (
		<div
			aria-hidden="true"
			className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card"
		>
			<div className="flex h-11 items-center gap-4 border-b bg-muted px-4">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="hidden h-3 w-32 sm:block" />
				<Skeleton className="hidden h-3 w-20 md:block" />
				<Skeleton className="ms-auto hidden h-3 w-24 lg:block" />
			</div>
			{bones("row", rows).map((key) => (
				<div
					key={key}
					className="flex items-center gap-4 border-subtle border-b px-4 py-3 last:border-b-0"
				>
					<Skeleton className="h-4 w-24 shrink-0" />
					<Skeleton className="h-4 w-full max-w-40" />
					<Skeleton className="hidden h-4 w-20 sm:block" />
					<Skeleton className="ms-auto hidden h-4 w-24 md:block" />
				</div>
			))}
		</div>
	);
}

export function TableFallback({ rows }: { rows?: number }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<Busy label="Loading the table…" />
			<div aria-hidden="true" className="flex flex-wrap items-center gap-2">
				<Skeleton className="h-8 w-full max-w-64" />
				<Skeleton className="h-8 w-24" />
				<Skeleton className="ms-auto h-8 w-28" />
			</div>
			<TableRowsBones rows={rows} />
			<Skeleton aria-hidden="true" className="h-8 w-full max-w-72" />
		</div>
	);
}

export function TablePageFallback({ rows }: { rows?: number }) {
	return (
		<PageShell className="min-h-0" aria-busy="true">
			<HeaderBones />
			<PageShellContent className="min-h-0">
				<TableFallback rows={rows} />
			</PageShellContent>
		</PageShell>
	);
}

export function FactsBones({ count = 8 }: { count?: number }) {
	return (
		<div
			aria-hidden="true"
			className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2"
		>
			{bones("fact", count).map((key) => (
				<div key={key} className="flex flex-col gap-1.5">
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-4 w-40 max-w-full" />
				</div>
			))}
		</div>
	);
}

export function RecordFallback() {
	return (
		<PageShell className="min-h-0" aria-busy="true">
			<Busy label="Loading the record…" />
			<PageShellHeader>
				<PageShellHeading>
					<div className="flex min-w-0 flex-col gap-2 sm:col-start-1 sm:row-start-1">
						<div className="flex items-center gap-3">
							<Skeleton className="h-6 w-48 max-w-full" />
							<Skeleton className="h-5 w-20" />
						</div>
						<Skeleton className="h-4 w-80 max-w-full" />
					</div>
				</PageShellHeading>
				<div className="flex gap-2 sm:col-start-2 sm:row-start-1 sm:justify-self-end">
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-20" />
				</div>
			</PageShellHeader>
			<PageShellContent className="min-h-0">
				<div aria-hidden="true" className="flex flex-col gap-4">
					<Skeleton className="h-9 w-full max-w-lg" />
					<FactsBones />
				</div>
			</PageShellContent>
		</PageShell>
	);
}

export function ListFallback({
	rows = 4,
	className,
}: {
	rows?: number;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<Busy label="Loading…" />
			<div
				aria-hidden="true"
				className="flex flex-col rounded-lg border bg-card"
			>
				{bones("line", rows).map((key) => (
					<div
						key={key}
						className="flex flex-col gap-2 border-subtle border-b px-4 py-3 last:border-b-0"
					>
						<Skeleton className="h-4 w-48 max-w-full" />
						<Skeleton className="h-3 w-64 max-w-full" />
					</div>
				))}
			</div>
		</div>
	);
}
