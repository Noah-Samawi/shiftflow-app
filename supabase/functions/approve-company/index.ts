// =====================================================================
// approve-company
// Handles the one-click Approve / Reject links from notify-new-company.
// Verifies the HMAC signature + expiry, then calls set_org_status() with
// source='email_link' (service role). Idempotent: the RPC only changes a
// company while it is still 'pending', so replays are harmless.
//
// URL: /functions/v1/approve-company?org=<uuid>&action=approve|reject&exp=<ts>&sig=<hex>
//
// Required secrets:
//   APPROVAL_SIGNING_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =====================================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const page = (title: string, msg: string, ok: boolean) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title></head>
     <body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8fafc;margin:0">
       <div style="background:#fff;padding:40px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.1);text-align:center;max-width:420px">
         <div style="font-size:40px">${ok ? "✅" : "⛔"}</div>
         <h1 style="font-size:20px;color:#0f172a">${title}</h1>
         <p style="color:#475569">${msg}</p>
       </div>
     </body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

serve(async (req) => {
  const url = new URL(req.url);
  const org = url.searchParams.get("org") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const exp = parseInt(url.searchParams.get("exp") ?? "0", 10);
  const sig = url.searchParams.get("sig") ?? "";

  const secret = Deno.env.get("APPROVAL_SIGNING_SECRET");
  if (!secret) return page("Konfigurationsfehler", "Signatur-Secret fehlt.", false);

  if (!org || (action !== "approve" && action !== "reject") || !exp || !sig) {
    return page("Ungültiger Link", "Der Link ist unvollständig.", false);
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    return page("Link abgelaufen", "Dieser Freischaltungslink ist abgelaufen (7 Tage).", false);
  }
  const expected = await sign(`${org}.${action}.${exp}`, secret);
  if (!timingSafeEqual(expected, sig)) {
    return page("Ungültige Signatur", "Der Link konnte nicht verifiziert werden.", false);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const newStatus = action === "approve" ? "active" : "rejected";
  const { data, error } = await supabase.rpc("set_org_status", {
    p_org_id: org,
    p_status: newStatus,
    p_source: "email_link",
    p_note: `One-click ${action} via signed email link`,
  });

  if (error) return page("Fehler", `Status konnte nicht gesetzt werden: ${error.message}`, false);

  const name = (data && (data.name as string)) || org;
  return action === "approve"
    ? page("Firma freigeschaltet", `„${name}“ ist jetzt aktiv und kann die Anwendung nutzen.`, true)
    : page("Firma abgelehnt", `„${name}“ wurde abgelehnt.`, false);
});
