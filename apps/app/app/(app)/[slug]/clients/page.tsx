import type { Metadata } from "next";
import { ClientsView } from "./clients-view";

export const metadata: Metadata = {
	title: "Clients",
};

export default function ClientsPage({
	searchParams,
}: PageProps<"/[slug]/clients">) {
	return <ClientsView view="clients" searchParams={searchParams} />;
}
