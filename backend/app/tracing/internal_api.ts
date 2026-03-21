import { api } from "encore.dev/api";

import type { ScopeQuery } from "../core/types";
import {
  addTraceTags,
  getSpan,
  getTraceSpans,
  listSessions,
  listSpans,
  listTraces,
  stats,
  type SessionItem,
  type SpanItem,
  type TraceItem,
} from "./service";

export const listTracesRpc = api(
  { expose: false },
  async (req: ScopeQuery): Promise<{ traces: TraceItem[] }> => {
    return { traces: await listTraces(req) };
  }
);

export const listSpansRpc = api(
  { expose: false },
  async (req: ScopeQuery): Promise<{ spans: SpanItem[] }> => {
    return { spans: await listSpans(req) };
  }
);

export const getSpanRpc = api(
  { expose: false },
  async (req: ScopeQuery & { span_id: string }): Promise<{ span: SpanItem | null }> => {
    return { span: await getSpan(req, req.span_id) };
  }
);

export const getTraceSpansRpc = api(
  { expose: false },
  async (req: ScopeQuery & { trace_id: string }): Promise<{ spans: SpanItem[] }> => {
    return { spans: await getTraceSpans(req, req.trace_id) };
  }
);

export const addTraceTagsRpc = api(
  { expose: false },
  async (req: ScopeQuery & { trace_id: string; tags: string[] }): Promise<{ trace: TraceItem | null }> => {
    return { trace: await addTraceTags(req, req.trace_id, req.tags) };
  }
);

export const listSessionsRpc = api(
  { expose: false },
  async (req: ScopeQuery): Promise<{ sessions: SessionItem[] }> => {
    return { sessions: await listSessions(req) };
  }
);

export const getStatsRpc = api(
  { expose: false },
  async (req: ScopeQuery): Promise<{ trace_count: number; span_count: number }> => {
    return await stats(req);
  }
);
