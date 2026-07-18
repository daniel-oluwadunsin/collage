import { expect, test } from "@playwright/test";

const launch = (scenario: string, extra = "") =>
  `/?bridge=1&startapp=test-launch-token-1234567890&scenario=${scenario}${extra}`;

test("boots in a Telegram bridge and supports explicit themes", async ({
  page,
}) => {
  await page.goto(launch("status"));
  await expect(
    page.getByRole("heading", { name: "December Builders" }),
  ).toBeVisible();
  await page.getByText("Theme", { exact: true }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Contribution amount: ₦20,000")).toBeVisible();
});

test("shows invalid, expired, unauthorized, and wrong-action states", async ({
  page,
}) => {
  await page.goto(launch("invalid"));
  await expect(
    page.getByRole("heading", { name: "Telegram authentication failed" }),
  ).toBeVisible();
  await page.goto(launch("expired"));
  await expect(
    page.getByRole("heading", { name: "Action link expired" }),
  ).toBeVisible();
  await page.goto(launch("unauthorized"));
  await expect(
    page.getByRole("heading", { name: "You cannot use this action" }),
  ).toBeVisible();
  await page.goto(launch("wrong-action"));
  await expect(
    page.getByRole("heading", { name: "Wrong action link" }),
  ).toBeVisible();
});

test("creates a Collage and opens registration", async ({ page }) => {
  await page.goto(launch("create"));
  await page.getByLabel("Collage name").fill("July Builders");
  await page.getByLabel("Description").fill("Weekly group contribution");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First cycle starts").fill("2026-07-25T10:00");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Only after all paid and ledger reconciles"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create and open registration" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Registration is open" }),
  ).toBeVisible();
});

test("completes registration only after provider verification", async ({
  page,
}) => {
  await page.goto(launch("join"));
  await page.getByLabel("Full legal name").fill("Ada Okafor");
  await page.getByLabel("National Identification Number").fill("12345678901");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await page.getByLabel("Phone number").fill("+2348012345678");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await page.getByLabel("Six-digit code").fill("123456");
  await page.getByRole("button", { name: "Verify phone" }).click();
  await page.getByLabel("Bank").selectOption("044");
  await page.getByLabel("Account number").fill("0123457890");
  await page.getByRole("button", { name: "Check account name" }).click();
  await expect(page.getByText("ADA OKAFOR")).toBeVisible();
  await page.getByRole("button", { name: "Confirm payout account" }).click();
  await page.getByLabel("Payout position").selectOption("4");
  await page.getByRole("button", { name: "Reserve position" }).click();
  await page.getByLabel(/I accept rules version/).check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page
    .getByLabel("Email for provider authorization")
    .fill("ada@example.com");
  await page.getByRole("button", { name: "Continue to Monnify" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirming your saved card" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Registration confirmed" }),
  ).toBeVisible({ timeout: 5_000 });
});

test("resumes at payment setup and waits for direct-debit activation", async ({
  page,
}) => {
  await page.goto(launch("resume-payment"));
  await page.getByLabel("Payment method").getByText("Direct debit").click();
  await page
    .getByLabel("Email for provider authorization")
    .fill("ada@example.com");
  await page.getByLabel("Debit bank").selectOption("044");
  await page.getByLabel("Debit account number").fill("0123457890");
  await page.getByLabel("Contact address").fill("12 Marina Road, Lagos");
  await page.getByRole("button", { name: "Continue to Monnify" }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting for mandate activation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Registration confirmed" }),
  ).toBeVisible({ timeout: 5_000 });
});

test("shows full, closed, and already registered registration states", async ({
  page,
}) => {
  await page.goto(launch("full"));
  await expect(
    page.getByRole("heading", { name: "Registration is full" }),
  ).toBeVisible();
  await page.goto(launch("closed"));
  await expect(
    page.getByRole("heading", { name: "Registration is closed" }),
  ).toBeVisible();
  await page.goto(launch("registered"));
  await expect(
    page.getByRole("heading", { name: "Already registered" }),
  ).toBeVisible();
});

test("manual payment stays pending until server-confirmed success", async ({
  page,
}) => {
  await page.goto(launch("manual"));
  await page.getByLabel("Receipt email").fill("ada@example.com");
  await page
    .getByRole("button", { name: "Continue to secure checkout" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Provider confirmation pending" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contribution confirmed" }),
  ).toBeVisible({ timeout: 5_000 });
});

test("renders history and safe payment-method replacement", async ({
  page,
}) => {
  await page.goto(launch("status"));
  await page.getByRole("button", { name: "history" }).click();
  await expect(
    page.getByRole("heading", { name: "Cycle history" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "settings" }).click();
  await page.getByRole("button", { name: /Replace payment method/ }).click();
  await page.getByLabel("Provider email").fill("ada@example.com");
  await page
    .getByRole("button", { name: "Authorize replacement card" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Replacement pending" }),
  ).toBeVisible();
  await expect(
    page.getByText(/current payment method remains active/i),
  ).toBeVisible();
});

test("supports failed payout recovery without blind retry", async ({
  page,
}) => {
  await page.goto(launch("payout", "&payoutId=payout-test"));
  await expect(
    page.getByRole("heading", { name: "Recover this failed payout" }),
  ).toBeVisible();
  await page.getByLabel("Replacement bank").selectOption("044");
  await page.getByLabel("Replacement account number").fill("0123457890");
  await page.getByRole("button", { name: "Resolve account" }).click();
  await page
    .getByRole("button", { name: "Update account and retry once" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payout retry queued" }),
  ).toBeVisible();
});

test("disables financial actions while offline", async ({ page, context }) => {
  await page.goto(launch("manual"));
  await context.setOffline(true);
  await expect(page.getByText(/You’re offline/)).toBeVisible();
  await context.setOffline(false);
});
