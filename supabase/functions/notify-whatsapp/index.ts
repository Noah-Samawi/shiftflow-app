import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  const { phoneNumber, message } = await req.json();
  if (!phoneNumber || !message) {
    return new Response(
      JSON.stringify({ error: "Missing phoneNumber or message" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid || !authToken || !fromNumber) {
    return new Response(
      JSON.stringify({ error: "Twilio credentials not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // +49 prefix hinzufügen, führende 0 entfernen
  const cleaned = phoneNumber.replace(/^0/, "");
  const to = `whatsapp:+49${cleaned}`;
  const from = `whatsapp:${fromNumber}`;

  const body = new URLSearchParams({
    From: from,
    To: to,
    Body: message,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  const result = await response.json();
  return new Response(JSON.stringify(result), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});
