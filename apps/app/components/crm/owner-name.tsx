import { EmptyCellValue } from "@crm/ui/components/empty-cell";

export function OwnerName({
	owner,
}: {
	owner: { userId: string; name: string } | null;
}) {
	if (!owner) return <EmptyCellValue />;
	return <span className="truncate">{owner.name}</span>;
}
