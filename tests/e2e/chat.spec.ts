import { expect, test } from "@playwright/test";

test.describe("Cheetah support chat", () => {
  test("Customer can send a message and receive a support reply", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Good");
    await expect(page.locator(".powered")).toContainText("SUPPORT MODE");

    const message = `My Wi-Fi is slow ${Date.now()}`;
    const input = page.locator('input[placeholder*="Ask us anything"]');
    await expect(input).toBeEnabled();
    await input.fill(message);
    await page.locator("button.send-button").click();

    await expect(
      page.locator(".message-row.from-user").filter({ hasText: message }),
    ).toBeVisible();
    await expect(
      page.locator(".message-row.from-assistant").last(),
    ).toContainText(/quick speed check|Wi-Fi|router/i, { timeout: 20000 });
  });

  test("Support mode shows and a new chat is added to recent conversations", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator(".powered")).toContainText("SUPPORT MODE");
    const message = `My internet drops ${Date.now()}`;
    await expect(
      page.locator('input[placeholder*="Ask us anything"]'),
    ).toBeEnabled();

    await page.locator("button.new-chat-button").click();

    const input = page.locator('input[placeholder*="Ask us anything"]');
    await input.fill(message);
    await page.locator("button.send-button").click();

    await expect(
      page.locator(".message-row.from-user").filter({ hasText: message }),
    ).toBeVisible();
    await expect(
      page.locator(".conversation-link").filter({ hasText: message }),
    ).toBeVisible();
  });
});
