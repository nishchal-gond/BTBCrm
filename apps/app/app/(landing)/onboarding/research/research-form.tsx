"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ResearchForm({ canManage }: { canManage: boolean }) {
	const trpc = useTRPC();
	const router = useRouter();

	const keyId = useId();

	const onward = () => {
		router.refresh();
		router.replace("/");
	};

	const save = useMutation(
		trpc.settings.setResearchKey.mutationOptions({
			onSuccess: onward,
			onError: (error) => toast.error(error.message),
		}),
	);

	const defer = useMutation(
		trpc.settings.deferResearchKey.mutationOptions({
			onSuccess: onward,
			onError: (error) => toast.error(error.message),
		}),
	);

	const busy = save.isPending || defer.isPending;

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				save.mutate({ apiKey: String(form.get("apiKey") ?? "").trim() });
			}}
			className="flex flex-col gap-6"
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={keyId}>Context API key</FieldLabel>
					<Input
						id={keyId}
						name="apiKey"
						type="password"
						placeholder="Paste the key"
						autoComplete="off"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						autoFocus
						required
						disabled={!canManage || busy}
					/>
					<FieldDescription>
						Don't have a Context API key?{" "}
						<a
							href={CONTEXT_DEV_SIGNUP_URL}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							Sign up here
						</a>
					</FieldDescription>
				</Field>
			</FieldGroup>

			<div className="flex flex-col gap-3">
				<Button type="submit" disabled={!canManage || busy}>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					Continue
				</Button>
				<Button
					type="button"
					variant="ghost"
					disabled={!canManage || busy}
					onClick={() => defer.mutate()}
				>
					{defer.isPending ? <Spinner data-icon="inline-start" /> : null}
					Not now
				</Button>
				<p className="text-center text-muted-foreground text-xs">
					{canManage
						? "Company research stays off until a key is saved. Everything else in the CRM works."
						: "Only an owner or an admin sets this key. Ask one of them to finish this step."}
				</p>
			</div>
		</form>
	);
}
