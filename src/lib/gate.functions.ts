import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

type GateSession = { unlocked?: boolean };

function config() {
  return {
    password: process.env["SESSION_SECRET"] || "zyraxon-ultra-secure-key-32-characters-long!",
    name: "zyraxon-gate",
    maxAge: 60 * 60 * 24 * 365,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export const checkGate = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(config());
  return { unlocked: session.data.unlocked === true };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const input = (data.password ?? "").trim().toLowerCase();
    const envPass = (process.env["SITE_PASSWORD"] ?? "").trim().toLowerCase();

    // zyraxon, gyroxon, zyraxonai অথবা এনভায়রনমেন্ট ভ্যারিয়েবলের পাসওয়ার্ড গ্রহণ করবে
    const valid = ["zyraxon", "gyroxon", "zyraxonai"];
    if (envPass) valid.push(envPass);

    if (!valid.includes(input)) {
      return { ok: false as const };
    }

    const session = await useSession<GateSession>(config());
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const unlockAsGuest = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(config());
  await session.update({ unlocked: true });
  return { ok: true as const };
});

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(config());
  await session.clear();
  return { ok: true as const };
});
