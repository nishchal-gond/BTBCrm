"use client";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const GROUP_LABEL = {
	client: "Clients",
	company: "Companies",
	contact: "Contacts",
	deal: "Deals",
} as const;

const KINDS = ["client", "company", "contact", "deal"] as const;

type Kind = (typeof KINDS)[number];

export function QuickSwitcher() {
	const openRecord = useOpenRecord();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();

	const [open, setOpen] = useQueryState(
		SEARCH_PARAM.dialog.switcher,
		parseAsBoolean.withDefault(false),
	);
	const [query, setQuery] = useState("");

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				void setOpen((current) => (current ? null : true));
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [setOpen]);

	const results = useQuery({
		...trpc.search.quick.queryOptions({ q: query }),
		enabled: open && query.trim().length >= 2,
		placeholderData: (previous) => previous,
	});

	const hits = results.data?.hits ?? [];

	const go = (kind: Kind, id: string) => {
		setQuery("");
		void setOpen(null);

		if (kind === "client") {
			router.push(workspaceUrl(`/clients/${id}`));
			return;
		}

		openRecord({ kind, id });
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => setOpen(next || null)}
			title="Search"
			description="Jump to a client, company, contact or deal"
		>
			<Command shouldFilter={false}>
				<CommandInput
					placeholder="Search by name, client ID, email or company…"
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					<CommandEmpty>
						{query.trim().length < 2
							? "Type at least two characters."
							: "Nothing matches."}
					</CommandEmpty>

					{KINDS.map((kind) => {
						const group = hits.filter((hit) => hit.kind === kind);
						if (group.length === 0) return null;

						return (
							<CommandGroup key={kind} heading={GROUP_LABEL[kind]}>
								{group.map((hit) => (
									<CommandItem
										key={`${hit.kind}:${hit.id}`}
										value={`${hit.kind}:${hit.id}`}
										onSelect={() => go(kind, hit.id)}
									>
										{hit.kind === "contact" || hit.kind === "client" ? (
											<PersonAvatar
												src={hit.imageUrl}
												name={hit.label}
												size="sm"
											/>
										) : (
											<EntityLogo
												src={hit.iconUrl}
												darkSrc={hit.iconDarkUrl}
												tone={hit.iconTone as EntityLogoTone | null | undefined}
												name={hit.label}
												size="sm"
											/>
										)}
										<span className="flex min-w-0 flex-col">
											<span className="truncate">{hit.label}</span>
											{hit.detail ? (
												<span className="truncate text-muted-foreground text-xs">
													{hit.detail}
												</span>
											) : null}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						);
					})}
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
