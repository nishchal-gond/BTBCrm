import type { StatusTone } from "@crm/ui/components/status-badge";
import { StatusBadge } from "@crm/ui/components/status-badge";
import type { RouterOutputs } from "@/lib/trpc/types";

export type DepositEntryType =
	RouterOutputs["deposits"]["list"]["rows"][number]["entryType"];

const LABELS = {
	PAYMENT: "Payment",
	REFUND: "Refund",
	ADJUSTMENT: "Adjustment",
} as const satisfies Record<DepositEntryType, string>;

const TONES = {
	PAYMENT: "positive",
	REFUND: "negative",
	ADJUSTMENT: "warning",
} as const satisfies Record<DepositEntryType, StatusTone>;

export function depositEntryLabel(entry: DepositEntryType): string {
	return LABELS[entry];
}

export function DepositEntryBadge({ entry }: { entry: DepositEntryType }) {
	return <StatusBadge tone={TONES[entry]}>{LABELS[entry]}</StatusBadge>;
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
	return (
		<StatusBadge tone={verified ? "positive" : "neutral"}>
			{verified ? "Verified" : "Pending"}
		</StatusBadge>
	);
}
