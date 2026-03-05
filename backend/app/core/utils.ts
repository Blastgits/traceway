import { APIError } from "encore.dev/api";

import { ScopeQuery } from "./types";

export function validateScope(scope: ScopeQuery): void {
  if (!scope.org_id || !scope.project_id) {
    throw APIError.invalidArgument("org_id and project_id are required");
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
