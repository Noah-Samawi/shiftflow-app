// =====================================================================
// notify-new-company
// Triggered by a Supabase Database Webhook on INSERT into
// public.organizations. Emails the platform owner with signed
// one-click Approve / Reject links for every PENDING registration.
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY            — Resend API key
//   APPROVAL_SIGNING_SECRET   — random high-entropy string (HMAC key)
//   PLATFORM_OWNER_EMAIL      — recipient (default noah.alsamawi@gmail.com)
//   SUPABASE_URL              — provided automatically
// =====================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  try {
    const body = await req.json();
    // Supabase DB webhook payload: { type, table, record, old_record, schema }
    const org = body.record ?? body;
    if (!org?.id) {
      return new Response(JSON.stringify({ error: "No organization record" }), { status: 400 });
    }
    // Only notify for pending registrations (owner's own org is created active).
    if (org.status && org.status !== "pending") {
      return new Response(JSON.stringify({ skipped: "not pending" }), { status: 200 });
    }

    const signingSecret = Deno.env.get("APPROVAL_SIGNING_SECRET");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const owner = Deno.env.get("PLATFORM_OWNER_EMAIL") ?? "noah.alsamawi@gmail.com";
    if (!signingSecret || !resendKey || !baseUrl) {
      return new Response(JSON.stringify({ error: "Missing required secrets" }), { status: 500 });
    }

    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const link = async (action: "approve" | "reject") => {
      const sig = await sign(`${org.id}.${action}.${exp}`, signingSecret);
      const u = new URL(`${baseUrl}/functions/v1/approve-company`);
      u.searchParams.set("org", org.id);
      u.searchParams.set("action", action);
      u.searchParams.set("exp", String(exp));
      u.searchParams.set("sig", sig);
      return u.toString();
    };
    const approveUrl = await link("approve");
    const rejectUrl = await link("reject");

    const html = `
      <h2>Neue Firmenregistrierung</h2>
      <table cellpadding="4">
        <tr><td><b>Firma:</b></td><td>${org.name ?? "—"}</td></tr>
        <tr><td><b>Org-ID:</b></td><td>${org.id}</td></tr>
        <tr><td><b>Status:</b></td><td>${org.status ?? "pending"}</td></tr>
        <tr><td><b>Registriert:</b></td><td>${org.created_at ?? new Date().toISOString()}</td></tr>
      </table>
      <p style="margin-top:16px">
        <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">✅ Freischalten</a>
        &nbsp;&nbsp;
        <a href="${rejectUrl}" style="background:#dc2626;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">⛔ Ablehnen</a>
      </p>
      <p style="color:#888;font-size:12px">Links sind 7 Tage gültig und einmalig wirksam (nur solange der Status „pending“ ist).</p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "ShiftFlow <info@noavio.de>",
        to: owner,
        subject: `Neue Firmenregistrierung: ${org.name ?? org.id}`,
        html,
      }),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Resend ${res.status}` }), { status: 502 });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
