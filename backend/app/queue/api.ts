import { APIError, api } from "encore.dev/api";

import { ScopeQuery } from "../core/types";
import { validateScope } from "../core/utils";
import { ClaimRequest, EnqueueRequest, SubmitRequest } from "./types";
import { QueueService } from "./service";

export const listQueue = api(
  { expose: true, auth: true, method: "GET", path: "/internal/queue" },
  async (req: ScopeQuery & { dataset_id?: string }) => {
    validateScope(req);
    const items = await QueueService.list(req.org_id, req.project_id, req.dataset_id);
    return { items, count: items.length };
  }
);

export const enqueue = api(
  { expose: true, auth: true, method: "POST", path: "/internal/queue/enqueue" },
  async (req: EnqueueRequest) => {
    validateScope(req);
    const items = await QueueService.enqueue(req.org_id, req.project_id, req.dataset_id, req.datapoint_ids);
    return { items, count: items.length };
  }
);

export const claim = api(
  { expose: true, auth: true, method: "POST", path: "/internal/queue/:id/claim" },
  async (req: ClaimRequest) => {
    validateScope(req);
    const item = await QueueService.claim(req.org_id, req.project_id, req.id, req.claimed_by);
    if (!item) {
      throw APIError.aborted("Queue item not pending or not found");
    }
    return item;
  }
);

export const submit = api(
  { expose: true, auth: true, method: "POST", path: "/internal/queue/:id/submit" },
  async (req: SubmitRequest) => {
    validateScope(req);
    const item = await QueueService.submit(req.org_id, req.project_id, req.id, req.edited_data ?? null);
    if (!item) {
      throw APIError.aborted("Queue item not claimed or not found");
    }
    return item;
  }
);
