import { api } from "encore.dev/api";

import { sendInviteEmail, sendPasswordResetEmail } from "./resend";

export const sendInviteEmailRpc = api(
  { expose: false },
  async (req: { email: string; token: string; inviter_name?: string }): Promise<{ ok: boolean }> => {
    await sendInviteEmail(req.email, req.token, req.inviter_name);
    return { ok: true };
  }
);

export const sendPasswordResetEmailRpc = api(
  { expose: false },
  async (req: { email: string; token: string }): Promise<{ ok: boolean }> => {
    await sendPasswordResetEmail(req.email, req.token);
    return { ok: true };
  }
);
