import { Header, Gateway } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { APIError } from "encore.dev/api";

interface AuthParams {
  serviceToken?: Header<"x-traceway-control-token">;
}

export interface AuthData {
  userID: string;
  principal: "traceway-daemon" | "dev";
}

export const auth = authHandler<AuthParams, AuthData>(async (params) => {
  const expected =
    process.env.TRACEWAY_BACKEND_TOKEN ?? process.env.TRACEWAY_CONTROL_PLANE_TOKEN ?? "";

  // Local dev mode: allow unauthenticated requests
  const isLocalDev = process.env.TRACEWAY_LOCAL_DEV?.trim() === "true";
  if (!expected || isLocalDev) {
    if (params.serviceToken && expected && params.serviceToken === expected) {
      return { userID: "traceway-daemon", principal: "traceway-daemon" };
    }
    return { userID: "local-dev", principal: "dev" };
  }

  if (!params.serviceToken || params.serviceToken !== expected) {
    throw APIError.unauthenticated("Invalid service token");
  }

  return { userID: "traceway-daemon", principal: "traceway-daemon" };
});

export const gateway = new Gateway({ authHandler: auth });
