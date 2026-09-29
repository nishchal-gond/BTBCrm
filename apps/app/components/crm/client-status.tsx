import type { StatusTone } from "@crm/ui/components/status-badge";
import { StatusBadge } from "@crm/ui/components/status-badge";
import type { RouterOutputs } from "@/lib/trpc/types";

export type ClientStatus = RouterOutputs["clients"]["byRef"]["status"];

const LABELS = {
	LEAD: "Lead",
	QUALIFIED: "Qualified",
	MENTOR_ASSIGNED: "Mentor assigned",
	CONVERTED: "Converted",
	STUDENT: "Student",
	LOST: "Lost",
	DORMANT: "Dormant",
} as const satisfies Record<ClientStatus, string>;

const TONES = {
	LEAD: "info",
	QUALIFIED: "info",
	MENTOR_ASSIGNED: "warning",
	CONVERTED: "positive",
	STUDENT: "positive",
	LOST: "negative",
	DORMANT: "neutral",
} as const satisfies Record<ClientStatus, StatusTone>;

export function clientStatusLabel(status: ClientStatus): string {
	return LABELS[status];
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
	return <StatusBadge tone={TONES[status]}>{LABELS[status]}</StatusBadge>;
}
