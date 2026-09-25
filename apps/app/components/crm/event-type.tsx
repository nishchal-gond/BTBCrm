import type { StatusTone } from "@crm/ui/components/status-badge";
import { StatusBadge } from "@crm/ui/components/status-badge";
import type { RouterOutputs } from "@/lib/trpc/types";

export type EventType =
	RouterOutputs["events"]["forClient"]["upcoming"][number]["eventType"];

export type EventResponse =
	RouterOutputs["events"]["forClient"]["upcoming"][number]["attendees"][number]["response"];

const LABELS = {
	SALES_CALL: "Sales call",
	CLIENT_APPOINTMENT: "Appointment",
	MENTOR_SESSION: "Mentor session",
	REVIEW: "Review",
	ONBOARDING: "Onboarding",
	COMPANY_MEETING: "Company meeting",
	INTERNAL_TRAINING: "Internal training",
	OTHER: "Other",
} as const satisfies Record<EventType, string>;

const TONES = {
	SALES_CALL: "info",
	CLIENT_APPOINTMENT: "info",
	MENTOR_SESSION: "positive",
	REVIEW: "positive",
	ONBOARDING: "warning",
	COMPANY_MEETING: "neutral",
	INTERNAL_TRAINING: "neutral",
	OTHER: "neutral",
} as const satisfies Record<EventType, StatusTone>;

const RESPONSE_LABELS = {
	PENDING: "No answer",
	ACCEPTED: "Going",
	DECLINED: "Not going",
	TENTATIVE: "Maybe",
} as const satisfies Record<EventResponse, string>;

const RESPONSE_TONES = {
	PENDING: "neutral",
	ACCEPTED: "positive",
	DECLINED: "negative",
	TENTATIVE: "warning",
} as const satisfies Record<EventResponse, StatusTone>;

export function eventTypeLabel(type: EventType): string {
	return LABELS[type];
}

export function eventResponseLabel(response: EventResponse): string {
	return RESPONSE_LABELS[response];
}

export function EventTypeBadge({ type }: { type: EventType }) {
	return <StatusBadge tone={TONES[type]}>{LABELS[type]}</StatusBadge>;
}

export function EventResponseBadge({ response }: { response: EventResponse }) {
	return (
		<StatusBadge tone={RESPONSE_TONES[response]}>
			{RESPONSE_LABELS[response]}
		</StatusBadge>
	);
}
