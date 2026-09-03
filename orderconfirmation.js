/**
 * Paste this logic into your orderConfirmation.html
 * (or replace the "I Already Paid" click handler)
 *
 * Change the two URLs if your Vercel project name is different.
 */
const NOTIFY_URL = "https://intern7zsa-github-com.vercel.app/api/notify-sale";
const CHECK_URL  = "https://intern7zsa-github-com.vercel.app/api/check-payment";

// order comes from sessionStorage (set by checkout.html)
// order = { payment_intent_id, qr_image_url, name, email, phone, amount, order_ref, quantity, items }

async function onAlreadyPaidClick() {
  const order = JSON.parse(sessionStorage.getItem("paymongoOrder") || "null");
  if (!order?.payment_intent_id) {
    alert("No order found. Please go back to checkout.");
    return;
  }

  const btn = document.getElementById("check-btn"); // your button id
  const msg = document.getElementById("msg");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Checking…";
  }
  if (msg) msg.innerHTML = '<span style="color:#64b5f6">Verifying payment…</span>';

  try {
    // 1) Optional: quick status check
    const checkRes = await fetch(
      CHECK_URL + "?id=" + encodeURIComponent(order.payment_intent_id)
    );
    const checkData = await checkRes.json();

    if (!checkData.paid && checkData.status !== "succeeded") {
      if (msg) {
        msg.innerHTML =
          '<span style="color:#f44336">Payment not completed yet (status: ' +
          (checkData.status || "unknown") +
          "). Scan the QR and try again.</span>";
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = "I Already Paid – Check Status";
      }
      return;
    }

    // 2) Notify Vercel → verify again + send emails
    const notifyRes = await fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_intent_id: order.payment_intent_id,
        name: order.name,
        email: order.email,
        phone: order.phone,
        amount: order.amount,
        order_ref: order.order_ref,
        quantity: order.quantity,
      }),
    });
    const notifyData = await notifyRes.json();

    if (!notifyData.success) {
      throw new Error(notifyData.message || notifyData.error || "Could not confirm payment");
    }

    // Clear cart
    try {
      localStorage.removeItem("coffeeCart");
      localStorage.removeItem("cart");
    } catch (e) {}
    sessionStorage.removeItem("paymongoOrder");

    if (msg) {
      msg.innerHTML =
        '<span style="color:#4caf50">Payment confirmed! Thank-you email sent. Redirecting…</span>';
    }

    setTimeout(() => {
      window.location.href = "Success.html";
    }, 1500);
  } catch (err) {
    console.error(err);
    if (msg) {
      msg.innerHTML =
        '<span style="color:#f44336">' + (err.message || "Error") + "</span>";
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "I Already Paid – Check Status";
    }
  }
}
