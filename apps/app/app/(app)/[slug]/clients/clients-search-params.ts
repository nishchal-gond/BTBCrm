import { createListSearchParams } from "@/components/data-table/list-search-params";

export const clientsSearchParams = createListSearchParams({
	defaultSort: "lastActivityAt",
	defaultDir: "desc",
	facetIds: ["status", "salesOwner", "mentorOwner"] as const,
});

export const CLIENT_VIEW_COPY = {
	leads: {
		title: "Leads",
		description: "People in the pipeline, before they convert.",
		empty: "No leads match this view.",
	},
	clients: {
		title: "Clients",
		description: "Everyone on the book, at every stage.",
		empty: "No clients match this view.",
	},
	students: {
		title: "Students",
		description: "Converted clients and the people studying now.",
		empty: "No students match this view.",
	},
} as const;
