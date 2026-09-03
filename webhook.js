/**
 * POST /api/webhook
 *
 * PayMongo webhook endpoint for event: payment.paid
 *
 * Setup:
 *   PayMongo Dashboard → Developers → Webhooks → Add endpoint
 *   URL:  https://YOUR-VERCEL-APP.vercel.app/api/webhook
 *   Event: payment.paid
 *
 * Optional: set WEBHOOK_URL_KEY env var and append ?key=... to the URL
 * for simple protection.
 *
 * Note: PayMongo payment objects include payment_intent_id and amount,
 * but may not include the customer name/email you collected at checkout.
 * For full customer details, prefer /api/notify-sale (browser button)
 * or store pending orders in a DB when creating the QR.
 */
const { sendOrderEmails } = require("./_mail");

module.exports = async (req, res) => {
  // Optional simple key protection
  const expectedKey = process.env.WEBHOOK_URL_KEY || "";
  if (expectedKey) {
    const provided = req.query?.key || "";
    if (provided !== expectedKey) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = req.body || {};
    const eventType =
      payload?.data?.attributes?.type ||
      payload?.data?.attributes?.event ||
      "";

    const resource =
      payload?.data?.attributes?.data || payload?.data || null;

    if (!resource) {
      // Acknowledge so PayMongo stops retrying
      return res.status(200).json({ ok: true, note: "no resource" });
    }

    const attrs = resource.attributes || {};
    const status = attrs.status || "";
    let paymentIntentId =
      attrs.payment_intent_id ||
      (String(resource.id || "").startsWith("pi_") ? resource.id : null);

    const isPaid =
      String(eventType).toLowerCase().includes("paid") ||
      status === "paid" ||
      status === "succeeded";

    if (!isPaid || !paymentIntentId) {
      return res.status(200).json({
        ok: true,
        note: "ignored",
        eventType,
        paymentIntentId,
      });
    }

    const amountCentavos = attrs.amount ?? null;
    const amountDisplay =
      amountCentavos != null ? (amountCentavos / 100).toFixed(2) : "";

    // Billing info is often present on the payment resource
    const billing = attrs.billing || {};

    const order = {
      payment_intent_id: paymentIntentId,
      name: billing.name || attrs.description || "Customer",
      email: billing.email || "",
      phone: billing.phone || "",
      amount: amountDisplay,
      amount_display: amountDisplay,
      amount_centavos: amountCentavos,
      order_ref: "ORDER-" + Date.now(),
      quantity: 1,
      status: "paid",
      source: "webhook",
    };

    const mailResult = await sendOrderEmails(order);

    console.log(
      `[webhook] ${paymentIntentId} owner=${mailResult.ownerSent} customer=${mailResult.customerSent}`
    );

    return res.status(200).json({
      ok: true,
      payment_intent_id: paymentIntentId,
      owner_email_sent: mailResult.ownerSent,
      customer_email_sent: mailResult.customerSent,
      errors: mailResult.errors,
    });
  } catch (err) {
    console.error("[webhook] error:", err);
    // Still 200 so PayMongo does not retry forever on mail failures
    return res.status(200).json({
      ok: false,
      error: err.message || "Internal error",
    });
  }
};
