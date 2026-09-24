import { createListSearchParams } from "@/components/data-table/list-search-params";

export const programsSearchParams = createListSearchParams({
	defaultSort: "code",
	defaultDir: "asc",
	tabId: "status",
});
