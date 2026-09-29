import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import Link from "next/link";

export function ClientNotFound({ backTo }: { backTo: string }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<Icon icon={UserMultiple} className="size-6 text-muted-foreground" />
			<p className="font-medium text-base">Not found</p>
			<p className="max-w-[46ch] text-muted-foreground text-sm">
				There is no client with that reference, or it is not one of yours.
			</p>
			<Button asChild variant="outline" size="sm">
				<Link href={backTo}>Back to clients</Link>
			</Button>
		</div>
	);
}
