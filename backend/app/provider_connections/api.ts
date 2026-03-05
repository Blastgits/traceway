import { APIError, api } from "encore.dev/api";

import { ScopeQuery } from "../core/types";
import { validateScope } from "../core/utils";
import { ProviderConnectionsService } from "./service";
import {
  DeleteProviderConnectionRequest,
  GetProviderConnectionRequest,
  ListProviderConnectionsResponse,
  UpsertProviderConnectionRequest,
} from "./types";

export const listProviderConnections = api(
  { expose: true, auth: true, method: "GET", path: "/internal/provider-connections" },
  async (scope: ScopeQuery): Promise<ListProviderConnectionsResponse> => {
    validateScope(scope);
    const connections = await ProviderConnectionsService.list(scope.org_id, scope.project_id);
    return { connections };
  }
);

export const getProviderConnection = api(
  { expose: true, auth: true, method: "GET", path: "/internal/provider-connections/:id" },
  async (req: GetProviderConnectionRequest) => {
    validateScope(req);
    const conn = await ProviderConnectionsService.get(req.org_id, req.project_id, req.id);
    if (!conn) {
      throw APIError.notFound("Provider connection not found");
    }
    return conn;
  }
);

export const upsertProviderConnection = api(
  { expose: true, auth: true, method: "PUT", path: "/internal/provider-connections/:id" },
  async (req: UpsertProviderConnectionRequest): Promise<{ ok: boolean }> => {
    validateScope(req);
    await ProviderConnectionsService.upsert(req.org_id, req.project_id, req);
    return { ok: true };
  }
);

export const deleteProviderConnection = api(
  { expose: true, auth: true, method: "DELETE", path: "/internal/provider-connections/:id" },
  async (req: DeleteProviderConnectionRequest): Promise<{ ok: boolean }> => {
    validateScope(req);
    await ProviderConnectionsService.delete(req.org_id, req.project_id, req.id);
    return { ok: true };
  }
);
