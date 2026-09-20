import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route(
    "https://generativelanguage.googleapis.com/v1beta/models?*",
    (route) =>
      route.fulfill({
        json: {
          models: [
            {
              name: "models/gemini-3.8-flash",
              displayName: "Gemini Flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        },
      }),
  );
});
test("projector viewport keeps composer and execution controls visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Send ↑" })).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Next step →" }),
  ).toBeInViewport();
  await page.screenshot({ path: "test-results/projector.png", fullPage: true });
});
async function configure(page: Page, remember = false) {
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page
    .getByLabel("API key", { exact: true })
    .fill("test-key-not-a-real-credential");
  if (remember) await page.getByLabel("Remember on this browser").check();
  await page.getByRole("button", { name: "Save settings" }).click();
}
test("desktop, mobile, and settings layout", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Ask. Act. Observe." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-mobile.png",
    fullPage: true,
  });
});
test("missing key prompts setup; storage and forget work", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Your request").fill("inspect");
  await page.getByRole("button", { name: "Send ↑" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("API key", { exact: true })
    .fill("test-key-not-a-real-credential");
  await page.getByRole("button", { name: "Save settings" }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("react-playground:key")),
  ).toBeTruthy();
  expect(
    await page.evaluate(() => localStorage.getItem("react-playground:key")),
  ).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "test-key-not-a-real-credential",
  );
  await page.getByLabel("Remember on this browser").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("react-playground:key")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("react-playground:key")),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByRole("button", { name: "Forget this key" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("react-playground:key")),
  ).toBeNull();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
});
test("real SDK wiring with mocked Gemini: step, execute, observe, verify, answer, reset", async ({
  page,
}) => {
  let count = 0;
  const requests: any[] = [];
  await page.route(
    "https://generativelanguage.googleapis.com/**",
    async (route) => {
      requests.push(route.request().postDataJSON());
      count++;
      const parts =
        count === 1
          ? [
              {
                functionCall: { name: "get_scene", args: {}, id: "s" },
                thoughtSignature: "c2lnbmF0dXJl",
              },
            ]
          : count === 2
            ? [
                {
                  functionCall: {
                    name: "move_shape",
                    args: { shape_id: "red_circle", x: 440, y: 220 },
                    id: "m",
                  },
                },
                {
                  functionCall: {
                    name: "check_relation",
                    args: {
                      subject_id: "red_circle",
                      relation: "inside",
                      target_id: "green_rectangle",
                    },
                    id: "v",
                  },
                },
              ]
            : [
                {
                  text: "The red circle is now completely inside the green rectangle.",
                },
              ];
      await route.fulfill({
        json: {
          candidates: [
            { content: { role: "model", parts }, finishReason: "STOP" },
          ],
        },
      });
    },
  );
  await page.goto("./");
  await configure(page);
  await page
    .getByRole("button", {
      name: "Move the red circle inside the green rectangle.",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Send ↑" }).click();
  await expect(page.locator("#status")).toContainText(
    "Ready for model request 1",
  );
  expect(count).toBe(0);
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator("#status")).toContainText(
    "Ready to execute get_scene",
  );
  expect(count).toBe(1);
  await expect(page.locator("#trace")).not.toContainText("Observation:");
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator("#status")).toContainText(
    "Ready for model request 2",
  );
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator("#status")).toContainText(
    "Ready to execute move_shape",
  );
  await expect(page.locator("#red_circle")).toHaveAttribute(
    "transform",
    "translate(120 130)",
  );
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page.locator("#status")).toContainText(
    "Ready to execute check_relation",
  );
  await expect(page.locator("#red_circle")).toHaveAttribute(
    "transform",
    "translate(440 220)",
  );
  await page.getByLabel("Auto-run").check();
  await expect(page.locator("#status")).toContainText("Complete");
  expect(count).toBe(3);
  expect(requests[1].contents[1].parts[0].thoughtSignature).toBe(
    "c2lnbmF0dXJl",
  );
  expect(
    requests[2].contents[4].parts[1].functionResponse.response.result,
  ).toBe(true);
  await expect(page.locator("#messages")).toContainText("completely inside");
  await expect(page.locator("#trace")).not.toContainText(
    "test-key-not-a-real-credential",
  );
  await page.screenshot({
    path: "test-results/completed-loop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reset demo", exact: false }).click();
  await expect(page.locator("#red_circle")).toHaveAttribute(
    "transform",
    "translate(120 130)",
  );
  await expect(page.locator("#event-count")).toHaveText("0 EVENTS");
});
test("stop at gate and API failure are recoverable", async ({ page }) => {
  await page.goto("./");
  await configure(page);
  await page.getByLabel("Your request").fill("move");
  await page.getByRole("button", { name: "Send ↑" }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Stopped");
  await expect(page.getByRole("button", { name: "Send ↑" })).toBeEnabled();
  await page.route("https://generativelanguage.googleapis.com/**", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: {
          code: 403,
          message: "test-key-not-a-real-credential rejected",
          status: "PERMISSION_DENIED",
        },
      },
    }),
  );
  await page.getByLabel("Auto-run").check();
  await page.getByLabel("Your request").fill("inspect");
  await page.getByRole("button", { name: "Send ↑" }).click();
  await expect(page.locator("#status")).toHaveText("Request failed");
  await expect(page.locator("#messages")).toContainText(
    "The provider rejected the key",
  );
  await expect(page.locator("#trace")).not.toContainText(
    "test-key-not-a-real-credential",
  );
});
test("model output is text, never executable HTML", async ({ page }) => {
  await page.route("https://generativelanguage.googleapis.com/**", (route) =>
    route.fulfill({
      json: {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: "<img src=x onerror=alert(1)>" }],
            },
          },
        ],
      },
    }),
  );
  await page.goto("./");
  await configure(page);
  await page.getByLabel("Auto-run").check();
  await page.getByLabel("Your request").fill("inspect");
  await page.getByRole("button", { name: "Send ↑" }).click();
  await expect(page.locator("#status")).toContainText("Complete");
  expect(await page.locator("#messages img").count()).toBe(0);
});
