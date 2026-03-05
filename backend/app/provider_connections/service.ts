import { and, asc, eq } from "drizzle-orm";

import { db } from "../core/database";
import { providerConnections } from "../core/schema";
import { ProviderConnection } from "./types";

function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined || value === "") {
    return null;
  }
  return value;
}

function toApiConnection(row: typeof providerConnections.$inferSelect): ProviderConnection {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    base_url: row.baseUrl ?? undefined,
    api_key: row.apiKey ?? undefined,
    default_model: row.defaultModel ?? undefined,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export const ProviderConnectionsService = {
  async list(orgId: string, projectId: string): Promise<ProviderConnection[]> {
    const rows = await db
      .select()
      .from(providerConnections)
      .where(and(eq(providerConnections.orgId, orgId), eq(providerConnections.projectId, projectId)))
      .orderBy(asc(providerConnections.createdAt));
    return rows.map(toApiConnection);
  },

  async get(orgId: string, projectId: string, id: string): Promise<ProviderConnection | null> {
    const [row] = await db
      .select()
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.id, id),
          eq(providerConnections.orgId, orgId),
          eq(providerConnections.projectId, projectId)
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return toApiConnection(row);
  },

  async upsert(orgId: string, projectId: string, conn: ProviderConnection): Promise<void> {
    const createdAt = new Date(conn.created_at);
    const updatedAt = new Date(conn.updated_at);

    const values = {
      id: conn.id,
      orgId,
      projectId,
      name: conn.name,
      provider: conn.provider,
      baseUrl: normalizeOptional(conn.base_url),
      apiKey: normalizeOptional(conn.api_key),
      defaultModel: normalizeOptional(conn.default_model),
      createdAt,
      updatedAt,
    };

    await db
      .insert(providerConnections)
      .values(values)
      .onConflictDoUpdate({
        target: providerConnections.id,
        set: {
          name: values.name,
          provider: values.provider,
          baseUrl: values.baseUrl,
          apiKey: values.apiKey,
          defaultModel: values.defaultModel,
          updatedAt: values.updatedAt,
        },
      });
  },

  async delete(orgId: string, projectId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(providerConnections)
      .where(
        and(
          eq(providerConnections.id, id),
          eq(providerConnections.orgId, orgId),
          eq(providerConnections.projectId, projectId)
        )
      )
      .returning({ id: providerConnections.id });

    return deleted.length > 0;
  },
};
