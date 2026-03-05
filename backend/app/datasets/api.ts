import { APIError, api } from "encore.dev/api";

import { ScopeQuery } from "../core/types";
import { validateScope } from "../core/utils";
import { DatasetsService } from "./service";
import {
  CreateDatapointRequest,
  CreateDatasetRequest,
  ListDatapointsRequest,
  UpdateDatasetRequest,
} from "./types";

export const listDatasets = api(
  { expose: true, auth: true, method: "GET", path: "/internal/datasets" },
  async (scope: ScopeQuery) => {
    validateScope(scope);
    const datasets = await DatasetsService.list(scope.org_id, scope.project_id);
    return { datasets, count: datasets.length };
  }
);

export const getDataset = api(
  { expose: true, auth: true, method: "GET", path: "/internal/datasets/:id" },
  async (req: ScopeQuery & { id: string }) => {
    validateScope(req);
    const dataset = await DatasetsService.get(req.org_id, req.project_id, req.id);
    if (!dataset) {
      throw APIError.notFound("Dataset not found");
    }
    return dataset;
  }
);

export const createDataset = api(
  { expose: true, auth: true, method: "POST", path: "/internal/datasets" },
  async (req: CreateDatasetRequest) => {
    validateScope(req);
    if (!req.name?.trim()) {
      throw APIError.invalidArgument("name is required");
    }
    return DatasetsService.create(req);
  }
);

export const updateDataset = api(
  { expose: true, auth: true, method: "PATCH", path: "/internal/datasets/:id" },
  async (req: UpdateDatasetRequest) => {
    validateScope(req);
    const updated = await DatasetsService.update(req);
    if (!updated) {
      throw APIError.notFound("Dataset not found");
    }
    return updated;
  }
);

export const deleteDataset = api(
  { expose: true, auth: true, method: "DELETE", path: "/internal/datasets/:id" },
  async (req: ScopeQuery & { id: string }) => {
    validateScope(req);
    const ok = await DatasetsService.delete(req.org_id, req.project_id, req.id);
    return { ok };
  }
);

export const listDatapoints = api(
  { expose: true, auth: true, method: "GET", path: "/internal/datasets/:id/datapoints" },
  async (req: ListDatapointsRequest) => {
    validateScope(req);
    const items = await DatasetsService.listDatapoints(req.org_id, req.project_id, req.id);
    return { items, count: items.length };
  }
);

export const createDatapoint = api(
  { expose: true, auth: true, method: "POST", path: "/internal/datasets/:dataset_id/datapoints" },
  async (req: CreateDatapointRequest) => {
    validateScope(req);
    if (req.dataset_id === "") {
      throw APIError.invalidArgument("dataset_id is required");
    }
    return DatasetsService.createDatapoint(req);
  }
);
