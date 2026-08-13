"use strict";

const {
  verificationEmail,
  welcomeEmail,
  existingAccountEmail,
} = require("../src/modules/auth/auth.emails");
const { BRAND } = require("../src/shared/constants");

/**
 * Email HTML cannot be checked by rendering it, so these assert the
 * properties that actually break in real inboxes - and the accessibility
 * decision the palette forces.
 */
const templates = [
  ["verification", verificationEmail({ fullName: "Raju", token: "abc123" })],
  ["welcome", welcomeEmail({ fullName: "Raju" })],
  ["existing account", existingAccountEmail({ fullName: "Raju" })],
];

describe.each(templates)("%s email", (_name, email) => {
  it("has a subject, HTML and a plain-text part", () => {
    // HTML-only mail scores badly with spam filters and some clients refuse
    // to render it at all.
    expect(email.subject).toEqual(expect.any(String));
    expect(email.html).toContain("<!doctype html>");
    expect(email.text.length).toBeGreaterThan(40);
  });

  it("uses the brand colour", () => {
    expect(email.html).toContain(BRAND.PRIMARY);
  });

  it("puts dark ink on the amber button, never white", () => {
    // White on #febc01 is 1.69:1 - well below the 4.5:1 WCAG AA minimum.
    const buttonMatch = /background-color:#febc01;?"?>([^<]*)/i.test(email.html);
    expect(buttonMatch || email.html.includes(BRAND.INK)).toBe(true);
    expect(email.html).not.toMatch(/color:#fff(fff)?;[^"]*background-color:#febc01/i);
  });

  it("lays out with tables, not flexbox or grid", () => {
    // Outlook renders through Word and supports neither.
    expect(email.html).toContain("<table");
    expect(email.html).not.toMatch(/display:\s*(flex|grid)/);
  });

  it("carries no <style> block, since Gmail strips them", () => {
    expect(email.html).not.toMatch(/<style[\s>]/i);
  });

  it("declares a light colour scheme so dark mode cannot invert the amber", () => {
    expect(email.html).toContain('name="color-scheme" content="light"');
  });

  it("includes a preheader for the inbox preview line", () => {
    expect(email.html).toMatch(/mso-hide:all/);
  });
});

describe("verification email", () => {
  const email = verificationEmail({ fullName: "Raju", token: "tok-123" });

  it("links to the frontend, not the API", () => {
    // Emailing an API endpoint would leave the user staring at raw JSON.
    expect(email.html).toContain("/verify-email?token=tok-123");
    expect(email.text).toContain("/verify-email?token=tok-123");
    expect(email.html).not.toContain("/api/v1/auth/verify-email");
  });

  it("repeats the URL as plain text in case the button is stripped", () => {
    const occurrences = email.html.split("/verify-email?token=tok-123").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("provides an Outlook (VML) button fallback", () => {
    // Outlook ignores padding on <a>, collapsing the button into bare text.
    expect(email.html).toContain("v:roundrect");
    expect(email.html).toContain("<!--[if mso]>");
  });

  it("says plainly that the account does not exist yet", () => {
    expect(email.text).toMatch(/not created until you confirm/i);
  });

  it("url-encodes the token", () => {
    const tricky = verificationEmail({ fullName: "R", token: "a+b/c=d" });
    expect(tricky.html).toContain(encodeURIComponent("a+b/c=d"));
  });
});
