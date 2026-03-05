import { Topic } from "encore.dev/pubsub";

export interface EvalRunRequestedEvent {
  org_id: string;
  project_id: string;
  run_id: string;
  dataset_id: string;
}

export const evalRunRequested = new Topic<EvalRunRequestedEvent>("eval-run-requested", {
  deliveryGuarantee: "at-least-once",
});
