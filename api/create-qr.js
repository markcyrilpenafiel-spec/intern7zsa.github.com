const PAYMONGO_SECRET_KEY = "sk_live_cPt11pVLZnJEsesJgsKsczEH"; // ← put your real PayMongo secret key here

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
    const { amount, description, name, email, phone } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: "Minimum amount is ₱1.00" });
    }
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // 1. Create Payment Intent
    const intentRes = await fetch("https://api.paymongo.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount,
            currency: "PHP",
            payment_method_allowed: ["qrph"],
            description: description || "Coffee Blend Order",
            statement_descriptor: "CoffeeBlend",
          },
        },
      }),
    });

    const intentData = await intentRes.json();
    if (!intentRes.ok) {
      console.error("PayMongo Intent error:", intentData);
      return res.status(400).json({
        error: intentData.errors?.[0]?.detail || "Failed to create payment intent",
      });
    }

    const paymentIntentId = intentData.data.id;
    const clientKey = intentData.data.attributes.client_key;

    // 2. Create Payment Method
    const methodRes = await fetch("https://api.paymongo.com/v1/payment_methods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            type: "qrph",
            billing: {
              name,
              email,
              phone: phone || "",
            },
          },
        },
      }),
    });

    const methodData = await methodRes.json();
    if (!methodRes.ok) {
      console.error("PayMongo Method error:", methodData);
      return res.status(400).json({
        error: methodData.errors?.[0]?.detail || "Failed to create payment method",
      });
    }

    const paymentMethodId = methodData.data.id;

    // 3. Attach
    const attachRes = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
        },
        body: JSON.stringify({
          data: {
            attributes: {
              payment_method: paymentMethodId,
              client_key: clientKey,
            },
          },
        }),
      }
    );

    const attachData = await attachRes.json();
    if (!attachRes.ok) {
      console.error("PayMongo Attach error:", attachData);
      return res.status(400).json({
        error: attachData.errors?.[0]?.detail || "Failed to attach payment method",
      });
    }

    const qrImage =
      attachData.data?.attributes?.next_action?.code?.image_url ||
      attachData.data?.attributes?.next_action?.redirect?.url ||
      null;

    if (!qrImage) {
      console.error("No QR found:", JSON.stringify(attachData, null, 2));
      return res.status(500).json({ error: "QR code not returned by PayMongo" });
    }

    return res.status(200).json({
      success: true,
      qr_image_url: qrImage,
      payment_intent_id: paymentIntentId,
      order_ref: "ORDER-" + Date.now(),
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
};
