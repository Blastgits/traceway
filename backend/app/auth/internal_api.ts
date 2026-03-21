import { api } from "encore.dev/api";

import { defaultScopeForLocal } from "./service";

export const getDefaultScopeRpc = api(
  { expose: false },
  async (): Promise<{ scope: { org_id: string; project_id: string } | null }> => {
    return { scope: await defaultScopeForLocal() };
  }
);
