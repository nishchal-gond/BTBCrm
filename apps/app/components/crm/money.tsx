import { cn } from "@crm/ui/lib/utils";

export function formatLedgerAmount(amount: string, currency: string): string {
	const value = Number(amount);

	if (!Number.isFinite(value)) return `${currency} —`;

	return new Intl.NumberFormat("en-AE", {
		style: "currency",
		currency,
		currencyDisplay: "code",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

export function Money({
	amount,
	currency,
	tone = "plain",
	className,
}: {
	amount: string;
	currency: string;
	tone?: "plain" | "signed";
	className?: string;
}) {
	const value = Number(amount);
	const negative = Number.isFinite(value) && value < 0;

	return (
		<span
			className={cn(
				"font-mono text-sm tabular-nums",
				tone === "signed" && negative && "text-negative-on-muted",
				className,
			)}
		>
			{formatLedgerAmount(amount, currency)}
		</span>
	);
}
