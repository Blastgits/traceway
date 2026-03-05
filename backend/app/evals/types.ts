import { ScopeQuery } from "../core/types";

export interface EvalRun {
  id: string;
  dataset_id: string;
  name?: string;
  config: unknown;
  scoring: string;
  status: string;
  results: unknown;
  trace_id?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
}

export interface EvalResult {
  id: string;
  run_id: string;
  datapoint_id: string;
  status: string;
  actual_output: unknown;
  score?: number;
  score_reason?: string;
  latency_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
  span_id?: string;
  created_at: string;
}

export type CreateEvalRunRequest = ScopeQuery & {
  id?: string;
  dataset_id: string;
  name?: string;
  config: unknown;
  scoring?: string;
};

export type UpdateEvalRunRequest = ScopeQuery & {
  id: string;
  status?: string;
  results?: unknown;
  trace_id?: string;
  completed_at?: string;
  error?: string;
};

export type CreateEvalResultRequest = ScopeQuery & {
  id?: string;
  run_id: string;
  datapoint_id: string;
  status?: string;
  actual_output?: unknown;
  score?: number;
  score_reason?: string;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  error?: string;
  span_id?: string;
};
