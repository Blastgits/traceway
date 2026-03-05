import { ScopeQuery } from "../core/types";

export interface CaptureRule {
  id: string;
  dataset_id: string;
  name: string;
  enabled: boolean;
  filters: unknown;
  sample_rate: number;
  captured_count: number;
  created_at: string;
}

export type CreateCaptureRuleRequest = ScopeQuery & {
  id?: string;
  dataset_id: string;
  name: string;
  filters?: unknown;
  sample_rate?: number;
};

export type UpdateCaptureRuleRequest = ScopeQuery & {
  id: string;
  name?: string;
  filters?: unknown;
  sample_rate?: number;
};
