import { cn } from "@crm/ui/lib/utils";

const DIGITS = new Intl.NumberFormat("en-AE", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export function formatLedgerAmount(amount: string, currency: string): string {
	const value = Number(amount);

	if (!Number.isFinite(value)) return `${currency} —`;

	return `${currency} ${DIGITS.format(value)}`;
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
				"inline-flex items-baseline gap-1.5 font-mono text-sm tabular-nums",
				tone === "signed" && negative && "text-negative-on-muted",
				className,
			)}
		>
			<span className="text-muted-foreground text-xs">{currency}</span>
			<span>{Number.isFinite(value) ? DIGITS.format(value) : "—"}</span>
		</span>
	);
}
