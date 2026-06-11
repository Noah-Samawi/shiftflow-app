import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { scheduleId } = await req.json();
  if (!scheduleId) {
    return new Response(JSON.stringify({ error: "Missing scheduleId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Schicht + Mitarbeiter + Kunde laden
  const { data: shift, error: shiftErr } = await supabase
    .from("schedules")
    .select(`
      shift_date, start_time, end_time, tasks,
      profiles ( full_name, id ),
      customers ( name )
    `)
    .eq("id", scheduleId)
    .single();

  if (shiftErr || !shift) {
    return new Response(
      JSON.stringify({ error: shiftErr?.message ?? "Shift not found" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Mitarbeiter E-Mail laden
  const { data: authUser, error: userErr } = await supabase.auth.admin
    .getUserById(shift.profiles.id);

  if (userErr || !authUser?.user?.email) {
    return new Response(
      JSON.stringify({ error: userErr?.message ?? "No email found" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const employeeEmail = authUser.user.email;
  const datum = new Date(shift.shift_date).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Nachbarschaftshilfe <info@noavio.de>",
      to: employeeEmail,
      subject: `Neue Schicht: ${datum}`,
      html: `
        <h2>Hallo ${shift.profiles.full_name},</h2>
        <p>Sie haben eine neue Schicht:</p>
        <table>
          <tr><td><b>Datum:</b></td><td>${datum}</td></tr>
          <tr><td><b>Zeit:</b></td><td>${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)} Uhr</td></tr>
          <tr><td><b>Kunde:</b></td><td>${shift.customers.name}</td></tr>
          <tr><td><b>Aufgaben:</b></td><td>${shift.tasks ?? "–"}</td></tr>
        </table>
        <p>Mit freundlichen Grüßen,<br/>M. Sharif Nachbarschaftshilfe</p>
      `,
    }),
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
