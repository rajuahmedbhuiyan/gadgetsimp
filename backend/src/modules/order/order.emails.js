"use strict";

const env = require("../../config/env");
const {
  layout,
  button,
  fallbackLink,
  paragraph: p,
  mutedParagraph: pMuted,
  greetingName,
} = require("../../shared/emailLayout");

const appUrl = () => env.APP_URL.replace(/\/$/, "");

function orderUrl(order) {
  return `${appUrl()}/orders/${order._id ?? order.id}`;
}

function adminOrdersUrl() {
  return `${appUrl()}/admin/orders`;
}

function money(value, currency = "BDT") {
  return `${currency} ${Number(value ?? 0).toLocaleString("en-US")}`;
}

function itemLines(order) {
  return order.items
    .map((item) => {
      const variant = item.variantLabel ? ` (${item.variantLabel})` : "";
      return `- ${item.name}${variant} x ${item.quantity}: ${money(item.lineTotal, order.currency)}`;
    })
    .join("\n");
}

function detailRows(rows) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin:22px 0;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
      ${rows
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;
                         font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                         font-size:13px;font-weight:700;color:#64748b;">${label}</td>
              <td align="right" style="padding:12px 16px;border-bottom:1px solid #e5e7eb;
                         font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                         font-size:14px;font-weight:700;color:#111827;">${value}</td>
            </tr>`
        )
        .join("")}
    </table>`;
}

function orderSummary(order) {
  return detailRows([
    ["Order", `#${order.orderNumber}`],
    ["Customer", order.contact.name],
    ["Phone", order.contact.phone],
    ["Status", order.status],
    ["Total", money(order.total, order.currency)],
  ]);
}

function customerOrderPlacedEmail({ order }) {
  const name = greetingName(order.contact.name);
  const url = orderUrl(order);

  return {
    subject: `Your GadgetSimp order #${order.orderNumber} is placed`,
    text: [
      `Hi ${name},`,
      "",
      `We received your order #${order.orderNumber}.`,
      "",
      itemLines(order),
      "",
      `Subtotal: ${money(order.subtotal, order.currency)}`,
      `Delivery: ${money(order.shippingFee, order.currency)}`,
      `Total: ${money(order.total, order.currency)}`,
      "",
      "Track it here:",
      url,
      "",
      "- The GadgetSimp team",
    ].join("\n"),
    html: layout({
      preheader: `Order #${order.orderNumber} is placed. Total ${money(order.total, order.currency)}.`,
      heading: `Thanks, ${name}. Your order is placed.`,
      body: `
        <p style="${p}">
          We received order <strong style="color:#111827;">#${order.orderNumber}</strong>
          and will keep you updated as it moves through delivery.
        </p>
        ${orderSummary(order)}
        ${button({ url, label: "Track order" })}
        ${fallbackLink(url)}
      `,
      footerNote:
        "You are receiving this because this email address was used at checkout.",
    }),
  };
}

function mainOrderPlacedEmail({ order }) {
  const url = adminOrdersUrl();

  return {
    subject: `New order #${order.orderNumber} - ${money(order.total, order.currency)}`,
    text: [
      `New order #${order.orderNumber}`,
      "",
      `Customer: ${order.contact.name}`,
      `Phone: ${order.contact.phone}`,
      `Email: ${order.email ?? "Not provided"}`,
      `Total: ${money(order.total, order.currency)}`,
      "",
      itemLines(order),
      "",
      url,
    ].join("\n"),
    html: layout({
      preheader: `New order #${order.orderNumber} from ${order.contact.name}.`,
      heading: `New order #${order.orderNumber}`,
      body: `
        <p style="${p}">
          A new order has been placed and is waiting in the admin queue.
        </p>
        ${orderSummary(order)}
        <p style="${pMuted}">Customer email: ${order.email ?? "Not provided"}</p>
        ${button({ url, label: "Open order queue" })}
      `,
      footerNote: "This operational notification was sent to the GadgetSimp team.",
    }),
  };
}

function orderStatusEmail({ order, previousStatus, note }) {
  const name = greetingName(order.contact.name);
  const url = orderUrl(order);

  return {
    subject: `Order #${order.orderNumber} is now ${order.status}`,
    text: [
      `Hi ${name},`,
      "",
      `Your order #${order.orderNumber} moved from ${previousStatus} to ${order.status}.`,
      note ? `Note: ${note}` : null,
      "",
      "Track your order here:",
      url,
      "",
      "- The GadgetSimp team",
    ]
      .filter((line) => line !== null)
      .join("\n"),
    html: layout({
      preheader: `Order #${order.orderNumber} is now ${order.status}.`,
      heading: `Your order is now ${order.status}`,
      body: `
        <p style="${p}">
          Order <strong style="color:#111827;">#${order.orderNumber}</strong>
          moved from <strong style="color:#111827;">${previousStatus}</strong>
          to <strong style="color:#111827;">${order.status}</strong>.
        </p>
        ${note ? `<p style="${pMuted}">Note: ${note}</p>` : ""}
        ${button({ url, label: "Track order" })}
        ${fallbackLink(url)}
      `,
      footerNote:
        "This update was sent because this email address is attached to the order.",
    }),
  };
}

module.exports = {
  customerOrderPlacedEmail,
  mainOrderPlacedEmail,
  orderStatusEmail,
};
