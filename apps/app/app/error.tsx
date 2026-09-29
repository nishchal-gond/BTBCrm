"use client";

import Restart from "@carbon/icons-react/es/Restart";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useEffect } from "react";

export default function AppError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 py-12 text-center">
			<Icon icon={WarningAlt} className="size-6 text-negative-on-muted" />
			<h1 className="text-balance font-semibold text-lg tracking-tight">
				This page did not load
			</h1>
			<p className="max-w-[52ch] text-balance text-muted-foreground text-sm">
				Nothing was changed. Try again, and if it keeps happening tell whoever
				runs this install.
			</p>
			{error.digest ? (
				<p className="font-mono text-muted-foreground text-xs tabular-nums">
					{error.digest}
				</p>
			) : null}
			<Button onClick={reset}>
				<Icon icon={Restart} data-icon="inline-start" />
				Try again
			</Button>
		</main>
	);
}
