import { APIError, api } from "encore.dev/api";

import { ScopeQuery } from "../core/types";
import { validateScope } from "../core/utils";
import { CaptureRulesService } from "./service";
import { CreateCaptureRuleRequest, UpdateCaptureRuleRequest } from "./types";

export const listCaptureRules = api(
  { expose: true, auth: true, method: "GET", path: "/internal/datasets/:dataset_id/rules" },
  async (req: ScopeQuery & { dataset_id: string }) => {
    validateScope(req);
    const items = await CaptureRulesService.list(req.org_id, req.project_id, req.dataset_id);
    return { items, count: items.length };
  }
);

export const createCaptureRule = api(
  { expose: true, auth: true, method: "POST", path: "/internal/datasets/:dataset_id/rules" },
  async (req: CreateCaptureRuleRequest) => {
    validateScope(req);
    if (!req.name?.trim()) {
      throw APIError.invalidArgument("name is required");
    }
    return CaptureRulesService.create(req);
  }
);

export const updateCaptureRule = api(
  { expose: true, auth: true, method: "PATCH", path: "/internal/rules/:id" },
  async (req: UpdateCaptureRuleRequest) => {
    validateScope(req);
    const rule = await CaptureRulesService.update(req);
    if (!rule) throw APIError.notFound("Rule not found");
    return rule;
  }
);

export const toggleCaptureRule = api(
  { expose: true, auth: true, method: "POST", path: "/internal/rules/:id/toggle" },
  async (req: ScopeQuery & { id: string }) => {
    validateScope(req);
    const rule = await CaptureRulesService.toggle(req.org_id, req.project_id, req.id);
    if (!rule) throw APIError.notFound("Rule not found");
    return rule;
  }
);

export const deleteCaptureRule = api(
  { expose: true, auth: true, method: "DELETE", path: "/internal/rules/:id" },
  async (req: ScopeQuery & { id: string }) => {
    validateScope(req);
    const ok = await CaptureRulesService.delete(req.org_id, req.project_id, req.id);
    return { ok };
  }
);
