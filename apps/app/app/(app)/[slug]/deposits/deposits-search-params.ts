import { createListSearchParams } from "@/components/data-table/list-search-params";

export const depositsSearchParams = createListSearchParams({
	defaultSort: "occurredAt",
	defaultDir: "desc",
	facetIds: ["entryType", "verified", "recordedBy"] as const,
});
