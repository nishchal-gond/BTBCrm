import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import { cn } from "@crm/ui/lib/utils";
import type { ReactNode } from "react";

export function PageNotice({
	icon,
	title,
	children,
	action,
	tone = "quiet",
	className,
}: {
	icon: CarbonIcon;
	title: string;
	children?: ReactNode;
	action?: ReactNode;
	tone?: "quiet" | "negative";
	className?: string;
}) {
	return (
		<div
			role={tone === "negative" ? "alert" : undefined}
			className={cn(
				"flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
				className,
			)}
		>
			<Icon
				icon={icon}
				className={cn(
					"size-6",
					tone === "negative" ? "text-negative" : "text-muted-foreground",
				)}
			/>
			<p className="max-w-[52ch] text-balance font-medium text-foreground text-sm">
				{title}
			</p>
			{children ? (
				<div className="max-w-[52ch] text-balance text-muted-foreground text-sm">
					{children}
				</div>
			) : null}
			{action}
		</div>
	);
}
