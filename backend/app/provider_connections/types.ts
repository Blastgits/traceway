import { ScopeQuery } from "../core/types";

export interface ProviderConnection {
  id: string;
  name: string;
  provider: string;
  base_url?: string;
  api_key?: string;
  default_model?: string;
  created_at: string;
  updated_at: string;
}

export interface ListProviderConnectionsResponse {
  connections: ProviderConnection[];
}

export type UpsertProviderConnectionRequest = ScopeQuery & ProviderConnection;

export interface GetProviderConnectionRequest extends ScopeQuery {
  id: string;
}

export interface DeleteProviderConnectionRequest extends ScopeQuery {
  id: string;
}
