import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const SOURCE = join(ROOT, "src");

const GENERATED = "generated";

const ENTRYPOINT = "src/app.module.ts";

const ROUTER_PATTERN = "**/*.router.ts";

const OUTPUT = "src/generated";

const DEBOUNCE_MS = 200;

const BINARY = join(ROOT, "node_modules", ".bin", "nestjs-trpc");

function describes(filename: string | null): boolean {
	if (filename === null) return false;

	const path = filename.split(/[\\/]/);

	if (path.includes(GENERATED)) return false;

	const leaf = path.at(-1) ?? "";

	return leaf.endsWith(".router.ts") || leaf === "app.module.ts";
}

function generate(): Promise<number> {
	return new Promise((settle) => {
		const child = spawn(
			BINARY,
			["generate", "-e", ENTRYPOINT, "-r", ROUTER_PATTERN, "-o", OUTPUT],
			{ cwd: ROOT, stdio: "inherit" },
		);

		child.on("close", (code) => settle(code ?? 1));
		child.on("error", () => settle(1));
	});
}

let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function drain(): Promise<void> {
	if (running) {
		queued = true;
		return;
	}

	running = true;

	do {
		queued = false;
		await generate();
	} while (queued);

	running = false;
}

function schedule(): void {
	if (timer !== null) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		void drain();
	}, DEBOUNCE_MS);
}

await drain();

watch(SOURCE, { recursive: true }, (_event, filename) => {
	if (describes(filename)) schedule();
});

process.stdout.write("[trpc] watching routers for changes\n");
