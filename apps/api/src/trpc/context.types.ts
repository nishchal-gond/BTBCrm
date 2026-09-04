import type { Session, SessionUser } from "@crm/auth";
import type { Actor } from "@crm/db/access";
import type { Request } from "express";

export type BaseTrpcContext = {
	req?: Request;
	session: Session | null;
};

export type AuthedTrpcContext = BaseTrpcContext & {
	user: SessionUser;
};

export type ActorTrpcContext = AuthedTrpcContext & {
	actor: Actor;
};
