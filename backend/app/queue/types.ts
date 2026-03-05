import { ScopeQuery } from "../core/types";

export interface QueueItem {
  id: string;
  dataset_id: string;
  datapoint_id: string;
  status: "pending" | "claimed" | "completed";
  claimed_by?: string;
  claimed_at?: string;
  original_data?: unknown;
  edited_data?: unknown;
  created_at: string;
  updated_at: string;
}

export type EnqueueRequest = ScopeQuery & {
  dataset_id: string;
  datapoint_ids: string[];
};

export type ClaimRequest = ScopeQuery & {
  id: string;
  claimed_by: string;
};

export type SubmitRequest = ScopeQuery & {
  id: string;
  edited_data?: unknown;
};
