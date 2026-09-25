const BAR = [
	"[&>td:first-child]:relative",
	"[&>td:first-child]:before:pointer-events-none [&>td:first-child]:before:absolute",
	"[&>td:first-child]:before:inset-y-0 [&>td:first-child]:before:left-0 [&>td:first-child]:before:w-0.5",
	"[&>td:first-child]:before:bg-accent [&>td:first-child]:before:opacity-0",
	"[&>td:first-child]:before:transition-opacity [&>td:first-child]:before:duration-[var(--dur-fast)]",
	"[&:hover>td:first-child]:before:opacity-60",
	"[&:focus-visible>td:first-child]:before:opacity-100",
].join(" ");

export const ROW_ACCENT = ["cursor-pointer", BAR].join(" ");
