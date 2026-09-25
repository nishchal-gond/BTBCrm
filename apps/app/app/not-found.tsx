import Search from "@carbon/icons-react/es/Search";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Not found",
};

export default function NotFound() {
	return (
		<main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 py-12 text-center">
			<Icon icon={Search} className="size-6 text-muted-foreground" />
			<h1 className="text-balance font-semibold text-lg tracking-tight">
				There is nothing here
			</h1>
			<p className="max-w-[52ch] text-balance text-muted-foreground text-sm">
				The page you asked for does not exist, or it is not yours to see.
			</p>
			<Button asChild>
				<Link href="/">Back to the CRM</Link>
			</Button>
		</main>
	);
}
