import type { Metadata } from "next";
import { ClientsView } from "../clients/clients-view";

export const instant = false;

export const metadata: Metadata = {
	title: "Students",
};

export default function StudentsPage({
	searchParams,
}: PageProps<"/[slug]/students">) {
	return <ClientsView view="students" searchParams={searchParams} />;
}
