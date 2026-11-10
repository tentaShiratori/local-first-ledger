import { expect } from "e2e";
import { test } from "@e2e-dev/web";

test("adds an entry, restores it after reload, and keeps the device id", async ({
  app,
  screen,
  browser,
}) => {
  await app.open("/");

  await expect(screen.getByTestId("entry-form")).toBeVisible();
  await expect(screen.getByTestId("device-id")).toBeVisible();

  const deviceIdBefore = await screen.getByTestId("device-id").textContent();
  expect(deviceIdBefore ?? "").not.toEqual("");

  await screen.getByTestId("field-date").fill("2026-11-10");
  await screen.getByTestId("field-amount").fill("680");
  await screen.getByTestId("field-category").fill("食費");
  await screen.getByTestId("field-memo").fill("コンビニ弁当");
  await screen.getByTestId("field-entered-by").selectOption("たろう");
  await screen.getByTestId("submit-entry").tap();

  await expect(screen.getByTestId("entry-item")).toBeVisible();
  await expect(screen.getByTestId("entry-memo")).toHaveText("コンビニ弁当");
  await expect(screen.getByTestId("entry-amount")).toHaveText("680円");
  await expect(screen.getByTestId("entry-entered-by")).toHaveText("たろう");

  await browser.reload();

  await expect(screen.getByTestId("entry-form")).toBeVisible();
  await expect(screen.getByTestId("entry-memo")).toHaveText("コンビニ弁当");
  await expect(screen.getByTestId("entry-amount")).toHaveText("680円");

  const deviceIdAfter = await screen.getByTestId("device-id").textContent();
  expect(deviceIdAfter).toBe(deviceIdBefore);
});

test("shows the input screen on first load", async ({ app, screen }) => {
  await app.open("/");
  await expect(screen.getByRole("heading", "オフライン家計簿")).toBeVisible();
  await expect(screen.getByTestId("entry-form")).toBeVisible();
  await expect(screen.getByTestId("tab-role")).toHaveText("writer");
});
