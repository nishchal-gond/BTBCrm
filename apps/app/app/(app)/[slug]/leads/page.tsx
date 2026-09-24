import type { Metadata } from "next";
import { ClientsView } from "../clients/clients-view";

export const instant = false;

export const metadata: Metadata = {
	title: "Leads",
};

export default function LeadsPage({
	searchParams,
}: PageProps<"/[slug]/leads">) {
	return <ClientsView view="leads" searchParams={searchParams} />;
}
