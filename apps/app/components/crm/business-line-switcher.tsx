"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Icon } from "@crm/ui/components/icon";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
	BUSINESS_LINE_LABELS,
	BUSINESS_LINE_SHORT,
	type BusinessLine,
} from "@/lib/business-line";
import { useTRPC } from "@/lib/trpc/client";
import { useBusinessLine } from "@/lib/use-business-line";

export function BusinessLineSwitcher() {
	const trpc = useTRPC();
	const [wanted, setLine] = useBusinessLine();
	const workspace = useQuery(
		trpc.clients.workspace.queryOptions({ vertical: wanted }),
	);

	if (workspace.isPending) {
		return <Skeleton className="h-8 w-32" aria-hidden="true" />;
	}

	const lines = workspace.data?.verticals ?? [];
	const line = workspace.data?.vertical ?? wanted;

	if (lines.length < 2) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="max-w-44"
					aria-label={`Business line: ${BUSINESS_LINE_LABELS[line]}. Change it.`}
				>
					<span className="truncate">{BUSINESS_LINE_SHORT[line]}</span>
					<ChevronDown className="shrink-0 opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-56">
				<DropdownMenuLabel>Business line</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={line}
					onValueChange={(value) => setLine(value as BusinessLine)}
				>
					{lines.map((option) => (
						<DropdownMenuRadioItem key={option} value={option}>
							<span className="flex-1">{BUSINESS_LINE_LABELS[option]}</span>
							{option === line ? (
								<Icon icon={Checkmark} className="size-3 text-accent" />
							) : null}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
