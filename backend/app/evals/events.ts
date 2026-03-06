import { Topic } from "encore.dev/pubsub";

export interface EvalRunRequestedEvent {
  org_id: string;
  project_id: string;
  run_id: string;
  dataset_id: string;
  requested_at: string;
}

export const evalRunRequested = new Topic<EvalRunRequestedEvent>("eval-run-requested", {
  deliveryGuarantee: "at-least-once",
});

export interface EvalRunCompletedEvent {
  org_id: string;
  project_id: string;
  run_id: string;
  status: "completed" | "failed" | "cancelled";
  artifact_key?: string;
  completed_at: string;
}

export const evalRunCompleted = new Topic<EvalRunCompletedEvent>("eval-run-completed", {
  deliveryGuarantee: "at-least-once",
});
