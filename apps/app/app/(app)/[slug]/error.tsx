"use client";

import { useEffect } from "react";
import { PageShell, PageShellContent } from "@/components/page-shell";
import { QueryError } from "@/components/query-error";

export default function WorkspaceError({
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
		<PageShell>
			<PageShellContent>
				<QueryError
					title="This screen did not load"
					message="Nothing was changed. Try again, and if it keeps happening tell whoever runs this install."
					onRetry={reset}
				/>
			</PageShellContent>
		</PageShell>
	);
}
