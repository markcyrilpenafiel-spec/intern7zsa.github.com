/**
 * POST /api/notify-sale
 *
 * Called by the frontend when the customer clicks "I Already Paid".
 *
 * Body (JSON):
 * {
 *   payment_intent_id: "pi_xxx",
 *   name, email, phone, amount, order_ref, quantity   // optional extras from sessionStorage
 * }
 *
 * Flow:
 *  1. Verify with PayMongo that the payment intent is succeeded
 *  2. Send owner sales email + customer thank-you email via Gmail
 */
const { sendOrderEmails } = require("./_mail");

const PAYMONGO_SECRET_KEY =
  process.env.PAYMONGO_SECRET_KEY || "";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!PAYMONGO_SECRET_KEY) {
      return res.status(500).json({
        error: "PAYMONGO_SECRET_KEY is not set on Vercel",
      });
    }

    const body = req.body || {};
    const paymentIntentId = body.payment_intent_id || body.id;

    if (!paymentIntentId || !String(paymentIntentId).startsWith("pi_")) {
      return res.status(400).json({ error: "Valid payment_intent_id required" });
    }

    // 1) Confirm payment status with PayMongo
    const pmRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      {
        method: "GET",
        headers: {
          Authorization:
            "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
        },
      }
    );

    const pmData = await pmRes.json();

    if (!pmRes.ok) {
      return res.status(400).json({
        error: pmData.errors?.[0]?.detail || "Failed to fetch payment status",
      });
    }

    const attrs = pmData.data?.attributes || {};
    const status = attrs.status || "unknown";
    const paid = status === "succeeded" || status === "paid";

    if (!paid) {
      return res.status(200).json({
        success: false,
        paid: false,
        status,
        message: "Payment is not completed yet. Status: " + status,
      });
    }

    // Build order object (prefer frontend data, fall back to PayMongo amount)
    const amountCentavos = attrs.amount ?? null;
    const amountDisplay =
      body.amount != null
        ? String(body.amount)
        : amountCentavos != null
        ? (amountCentavos / 100).toFixed(2)
        : "";

    const order = {
      payment_intent_id: paymentIntentId,
      name: body.name || "",
      email: body.email || "",
      phone: body.phone || "",
      amount: amountDisplay,
      amount_display: amountDisplay,
      amount_centavos: amountCentavos,
      order_ref: body.order_ref || "ORDER-" + Date.now(),
      quantity: body.quantity ?? 1,
      status: "paid",
    };

    // 2) Send emails
    const mailResult = await sendOrderEmails(order);

    return res.status(200).json({
      success: true,
      paid: true,
      payment_intent_id: paymentIntentId,
      order_ref: order.order_ref,
      owner_email_sent: mailResult.ownerSent,
      customer_email_sent: mailResult.customerSent,
      errors: mailResult.errors,
      message: "Payment confirmed. Notifications sent.",
    });
  } catch (err) {
    console.error("[notify-sale] error:", err);
    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};
