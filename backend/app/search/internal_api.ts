import { api } from "encore.dev/api";

import { mirrorSpan, mirrorTrace, type MirrorDoc } from "./turbopuffer";

export const mirrorTraceRpc = api(
  { expose: false },
  async (req: MirrorDoc): Promise<{ ok: boolean }> => {
    await mirrorTrace(req);
    return { ok: true };
  }
);

export const mirrorSpanRpc = api(
  { expose: false },
  async (req: MirrorDoc): Promise<{ ok: boolean }> => {
    await mirrorSpan(req);
    return { ok: true };
  }
);
