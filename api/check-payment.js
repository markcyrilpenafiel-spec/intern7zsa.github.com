const PAYMONGO_SECRET_KEY = "sk_live_cPt11pVLZnJEsesJgsKsczEH"; // ← same key you used in create-qr.js

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const paymentIntentId = req.query.id;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing payment intent id" });
    }

    const response = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${paymentIntentId}`,
      {
        method: "GET",
        headers: {
          Authorization: "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64"),
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("PayMongo error:", data);
      return res.status(400).json({
        error: data.errors?.[0]?.detail || "Failed to get payment status",
      });
    }

    const status = data.data?.attributes?.status || "unknown";
    const paid = status === "succeeded";

    return res.status(200).json({
      success: true,
      status: status,
      paid: paid,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
};
