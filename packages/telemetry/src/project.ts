const DEFAULT_HOST = "https://us.i.posthog.com";

export function posthogKey(
	env: Record<string, string | undefined> = process.env,
): string {
	return (env.CRM_TELEMETRY_KEY ?? "").trim();
}

export function posthogHost(
	env: Record<string, string | undefined> = process.env,
): string {
	return (env.CRM_TELEMETRY_HOST ?? "").trim() || DEFAULT_HOST;
}

export const POSTHOG_UI_HOST = "https://us.posthog.com";
