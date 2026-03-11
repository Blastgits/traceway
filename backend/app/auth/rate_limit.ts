import { CacheCluster, IntKeyspace, expireInMinutes } from "encore.dev/storage/cache";

const authCache = new CacheCluster("auth-cache", {
  evictionPolicy: "allkeys-lru",
});

const failedLoginsByIp = new IntKeyspace<{ ip: string }>(authCache, {
  keyPattern: "failed-login/ip/:ip",
  defaultExpiry: expireInMinutes(10),
});

const failedLoginsByEmail = new IntKeyspace<{ email: string }>(authCache, {
  keyPattern: "failed-login/email/:email",
  defaultExpiry: expireInMinutes(10),
});

const passwordResetsByIp = new IntKeyspace<{ ip: string }>(authCache, {
  keyPattern: "password-reset/ip/:ip",
  defaultExpiry: expireInMinutes(15),
});

const passwordResetsByEmail = new IntKeyspace<{ email: string }>(authCache, {
  keyPattern: "password-reset/email/:email",
  defaultExpiry: expireInMinutes(15),
});

const MAX_FAILED_LOGINS_PER_IP = 40;
const MAX_FAILED_LOGINS_PER_EMAIL = 8;
const MAX_PASSWORD_RESETS_PER_IP = 20;
const MAX_PASSWORD_RESETS_PER_EMAIL = 4;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isLoginRateLimited(email: string, ip: string): Promise<boolean> {
  try {
    const [ipFailures, emailFailures] = await Promise.all([
      failedLoginsByIp.get({ ip }),
      failedLoginsByEmail.get({ email: normalizeEmail(email) }),
    ]);

    return (ipFailures ?? 0) >= MAX_FAILED_LOGINS_PER_IP || (emailFailures ?? 0) >= MAX_FAILED_LOGINS_PER_EMAIL;
  } catch {
    return false;
  }
}

export async function recordFailedLogin(email: string, ip: string): Promise<void> {
  try {
    await Promise.all([
      failedLoginsByIp.increment({ ip }),
      failedLoginsByEmail.increment({ email: normalizeEmail(email) }),
    ]);
  } catch {
  }
}

export async function clearFailedLogins(email: string): Promise<void> {
  try {
    await failedLoginsByEmail.delete({ email: normalizeEmail(email) });
  } catch {
  }
}

export async function isPasswordResetRateLimited(email: string, ip: string): Promise<boolean> {
  try {
    const [ipAttempts, emailAttempts] = await Promise.all([
      passwordResetsByIp.get({ ip }),
      passwordResetsByEmail.get({ email: normalizeEmail(email) }),
    ]);

    return (ipAttempts ?? 0) >= MAX_PASSWORD_RESETS_PER_IP || (emailAttempts ?? 0) >= MAX_PASSWORD_RESETS_PER_EMAIL;
  } catch {
    return false;
  }
}

export async function recordPasswordResetAttempt(email: string, ip: string): Promise<void> {
  try {
    await Promise.all([
      passwordResetsByIp.increment({ ip }),
      passwordResetsByEmail.increment({ email: normalizeEmail(email) }),
    ]);
  } catch {
  }
}
