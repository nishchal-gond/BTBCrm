import { type Actor, type Capability, can } from "@crm/db/access";
import { ForbiddenException } from "@nestjs/common";

export function requireCapability(
	actor: Actor,
	capability: Capability,
	message: string,
): void {
	if (!can(actor, capability)) {
		throw new ForbiddenException(message);
	}
}
