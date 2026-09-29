"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { clientsSearchParams } from "@/app/(app)/[slug]/clients/clients-search-params";
import { companiesSearchParams } from "@/app/(app)/[slug]/companies/companies-search-params";
import { contactsSearchParams } from "@/app/(app)/[slug]/contacts/contacts-search-params";
import { dealsSearchParams } from "@/app/(app)/[slug]/deals/deals-search-params";
import { depositsSearchParams } from "@/app/(app)/[slug]/deposits/deposits-search-params";
import { programsSearchParams } from "@/app/(app)/[slug]/programs/programs-search-params";
import { DEFAULT_BUSINESS_LINE } from "@/lib/business-line";
import { useTRPC } from "@/lib/trpc/client";

export type Section =
	| "/"
	| "/leads"
	| "/clients"
	| "/students"
	| "/deposits"
	| "/programs"
	| "/companies"
	| "/contacts"
	| "/deals"
	| "/settings";

export function usePrefetchSection(): (section: string) => void {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		(section: string) => {
			switch (section) {
				case "/":
					void queryClient.prefetchQuery(
						trpc.overview.summary.queryOptions({
							vertical: DEFAULT_BUSINESS_LINE,
						}),
					);
					return;
				case "/leads":
				case "/clients":
				case "/students": {
					const base = clientsSearchParams.defaultInput();

					void queryClient.prefetchQuery(
						trpc.clients.list.queryOptions({
							q: base.q,
							sort: base.sort,
							dir: base.dir,
							page: base.page,
							pageSize: base.pageSize,
							vertical: DEFAULT_BUSINESS_LINE,
							view:
								section === "/leads"
									? "leads"
									: section === "/students"
										? "students"
										: "clients",
							status: base.status,
							salesOwner: base.salesOwner,
							mentorOwner: base.mentorOwner,
							source: [],
						}),
					);
					return;
				}
				case "/deposits": {
					const base = depositsSearchParams.defaultInput();

					void queryClient.prefetchQuery(
						trpc.deposits.list.queryOptions({
							q: base.q,
							sort: base.sort,
							dir: base.dir,
							page: base.page,
							pageSize: base.pageSize,
							vertical: DEFAULT_BUSINESS_LINE,
							entryType: base.entryType,
							verified: base.verified,
							recordedBy: base.recordedBy,
						}),
					);
					return;
				}
				case "/programs": {
					const base = programsSearchParams.defaultInput();

					void queryClient.prefetchQuery(
						trpc.programs.list.queryOptions({
							q: base.q,
							sort: base.sort,
							dir: base.dir,
							page: base.page,
							pageSize: base.pageSize,
							status: base.status === "all" ? "all" : "active",
						}),
					);
					return;
				}
				case "/companies":
					void queryClient.prefetchQuery(
						trpc.companies.list.queryOptions(
							companiesSearchParams.defaultInput(),
						),
					);
					return;
				case "/contacts":
					void queryClient.prefetchQuery(
						trpc.contacts.list.queryOptions(
							contactsSearchParams.defaultInput(),
						),
					);
					return;
				case "/deals":
					void queryClient.prefetchQuery(
						trpc.deals.list.queryOptions(dealsSearchParams.defaultInput()),
					);
					return;
				default:
					return;
			}
		},
		[trpc, queryClient],
	);
}
