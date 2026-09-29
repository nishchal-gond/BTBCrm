"use client";

import Restart from "@carbon/icons-react/es/Restart";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Button } from "@crm/ui/components/button";
import { PageNotice } from "@/components/page-notice";

export function QueryError({
	title = "That did not load",
	message,
	onRetry,
	retrying = false,
}: {
	title?: string;
	message?: string | null;
	onRetry?: () => void;
	retrying?: boolean;
}) {
	return (
		<PageNotice
			icon={WarningAlt}
			tone="negative"
			title={title}
			action={
				onRetry ? (
					<Button
						variant="outline"
						size="sm"
						onClick={onRetry}
						disabled={retrying}
					>
						<Restart data-icon="inline-start" />
						{retrying ? "Trying again…" : "Try again"}
					</Button>
				) : null
			}
		>
			{message ?? "The server did not answer. Nothing was changed."}
		</PageNotice>
	);
}
