/**
 * Shared email helpers for Vercel serverless functions.
 * Uses Gmail SMTP + App Password via Nodemailer.
 *
 * Required Vercel Environment Variables:
 *   GMAIL_USER          = yourfull@gmail.com
 *   GMAIL_APP_PASSWORD  = xxxx xxxx xxxx xxxx   (16-char App Password)
 *   OWNER_EMAIL         = where sales notifications go (can be same as GMAIL_USER)
 *   MAIL_FROM_NAME      = Rene Coffee Store   (optional)
 */
const nodemailer = require("nodemailer");

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars on Vercel"
    );
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOwnerEmailHtml(order) {
  const name = escapeHtml(order.name || "Customer");
  const email = escapeHtml(order.email || "");
  const phone = escapeHtml(order.phone || "");
  const amount = escapeHtml(order.amount_display || order.amount || "");
  const ref = escapeHtml(order.order_ref || "");
  const pi = escapeHtml(order.payment_intent_id || "");
  const qty = escapeHtml(String(order.quantity ?? ""));

  return `
<html><body style="font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:28px;">
    <h2 style="color:#c49b63;margin-top:0;">New sale received</h2>
    <p style="color:#ccc;">A customer completed a QR Ph payment on your store.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#888;">Customer</td><td style="padding:8px 0;color:#fff;"><strong>${name}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;color:#fff;">${email}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;color:#fff;">${phone}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Quantity</td><td style="padding:8px 0;color:#fff;">${qty}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Amount</td><td style="padding:8px 0;color:#c49b63;font-size:18px;"><strong>₱${amount}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#888;">Order ref</td><td style="padding:8px 0;color:#fff;">${ref}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Payment intent</td><td style="padding:8px 0;color:#aaa;font-size:12px;">${pi}</td></tr>
    </table>
    <p style="color:#666;font-size:12px;margin-bottom:0;">Rene Coffee · automatic sales notification</p>
  </div>
</body></html>`;
}

function buildCustomerThankYouHtml(order) {
  const name = escapeHtml(order.name || "Valued Customer");
  const amount = escapeHtml(order.amount_display || order.amount || "");
  const ref = escapeHtml(order.order_ref || "");
  const qty = escapeHtml(String(order.quantity ?? "1"));

  return `
<html><body style="font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:28px;">
    <h2 style="color:#c49b63;margin-top:0;">Thank you for your purchase!</h2>
    <p style="color:#ccc;line-height:1.5;">
      Hi <strong>${name}</strong>,<br><br>
      We truly appreciate you choosing <strong>Rene Coffee</strong>.
      Your order has been successfully received and is being prepared with care.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:24px 0;">
      <tr><td style="padding:8px 0;color:#888;">Order Reference</td><td style="padding:8px 0;color:#fff;"><strong>${ref}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#888;">Quantity</td><td style="padding:8px 0;color:#fff;">${qty}</td></tr>
      <tr><td style="padding:8px 0;color:#888;">Total Amount</td><td style="padding:8px 0;color:#c49b63;font-size:18px;"><strong>₱${amount}</strong></td></tr>
    </table>
    <p style="color:#ccc;line-height:1.5;">
      We will process your order shortly. If you have any questions, simply reply to this email.
    </p>
    <p style="color:#c49b63;margin-top:28px;font-weight:bold;">Enjoy your coffee! ☕</p>
    <p style="color:#666;font-size:12px;margin-bottom:0;margin-top:32px;">
      Rene Coffee · Thank you for supporting a local coffee brand
    </p>
  </div>
</body></html>`;
}

/**
 * Send owner sales notification + customer thank-you.
 * Returns { ownerSent, customerSent, errors[] }
 */
async function sendOrderEmails(order) {
  const transporter = getTransporter();
  const fromUser = process.env.GMAIL_USER;
  const fromName = process.env.MAIL_FROM_NAME || "Rene Coffee Store";
  const ownerEmail = process.env.OWNER_EMAIL || fromUser;
  const result = { ownerSent: false, customerSent: false, errors: [] };

  const from = `"${fromName}" <${fromUser}>`;

  // Owner notification
  try {
    await transporter.sendMail({
      from,
      to: ownerEmail,
      subject: `New sale – Rene Coffee (₱${order.amount_display || order.amount || "?"})`,
      html: buildOwnerEmailHtml(order),
    });
    result.ownerSent = true;
  } catch (err) {
    console.error("[mail] owner email failed:", err.message);
    result.errors.push("owner: " + err.message);
  }

  // Customer thank-you
  const customerEmail = (order.email || "").trim();
  if (customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    try {
      await transporter.sendMail({
        from,
        to: customerEmail,
        replyTo: fromUser,
        subject: "Thank you for your order – Rene Coffee",
        html: buildCustomerThankYouHtml(order),
      });
      result.customerSent = true;
    } catch (err) {
      console.error("[mail] customer email failed:", err.message);
      result.errors.push("customer: " + err.message);
    }
  } else {
    result.errors.push("customer: invalid or missing email");
  }

  return result;
}

module.exports = {
  sendOrderEmails,
  getTransporter,
};
