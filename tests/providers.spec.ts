import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route(
    "https://generativelanguage.googleapis.com/v1beta/models?*",
    (route) =>
      route.fulfill({
        json: {
          models: [
            {
              name: "models/gemini-3.8-flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        },
      }),
  );
});
for (const provider of ["openai", "anthropic", "openrouter"])
  test(`${provider}: discover models, execute tools, retain follow-up context`, async ({
    page,
  }) => {
    let models = 0,
      calls = 0;
    const bodies: any[] = [];
    const host =
      provider === "openai"
        ? "api.openai.com"
        : provider === "anthropic"
          ? "api.anthropic.com"
          : "openrouter.ai";
    await page.route(`https://${host}/**`, async (route) => {
      if (route.request().method() === "GET") {
        models++;
        await route.fulfill({
          json: {
            data: [
              {
                id:
                  provider === "openai"
                    ? "gpt-test"
                    : provider === "anthropic"
                      ? "claude-test"
                      : "vendor/test",
                name: "Test model",
                supported_parameters: ["tools"],
              },
            ],
            has_more: false,
          },
        });
        return;
      }
      calls++;
      bodies.push(route.request().postDataJSON());
      expect(
        route.request().headers()[
          provider === "anthropic" ? "x-api-key" : "authorization"
        ],
      ).toContain("provider-test-key");
      if (provider === "openai")
        await route.fulfill({
          json: {
            status: "completed",
            output:
              calls === 1
                ? [
                    {
                      type: "function_call",
                      call_id: "c1",
                      id: "fc1",
                      name: "move_shape",
                      arguments: JSON.stringify({
                        shape_id: "red_circle",
                        x: 440,
                        y: 220,
                      }),
                    },
                  ]
                : [
                    {
                      type: "message",
                      role: "assistant",
                      content: [{ type: "output_text", text: "Done." }],
                    },
                  ],
          },
        });
      if (provider === "anthropic")
        await route.fulfill({
          json: {
            stop_reason: calls === 1 ? "tool_use" : "end_turn",
            content:
              calls === 1
                ? [
                    {
                      type: "tool_use",
                      id: "c1",
                      name: "move_shape",
                      input: { shape_id: "red_circle", x: 440, y: 220 },
                    },
                  ]
                : [{ type: "text", text: "Done." }],
          },
        });
      if (provider === "openrouter")
        await route.fulfill({
          json: {
            choices: [
              {
                finish_reason: calls === 1 ? "tool_calls" : "stop",
                message:
                  calls === 1
                    ? {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: "c1",
                            type: "function",
                            function: {
                              name: "move_shape",
                              arguments: JSON.stringify({
                                shape_id: "red_circle",
                                x: 440,
                                y: 220,
                              }),
                            },
                          },
                        ],
                      }
                    : { role: "assistant", content: "Done." },
              },
            ],
          },
        });
    });
    await page.goto("./");
    await page.getByRole("button", { name: "Settings", exact: false }).click();
    await page.getByLabel("Provider", { exact: true }).selectOption(provider);
    await page.getByLabel("API key", { exact: true }).fill("provider-test-key");
    await page.getByRole("button", { name: "Refresh models" }).click();
    await expect(page.locator("#model-status")).toContainText("models ·");
    await page.getByRole("button", { name: "Save settings" }).click();
    await page.getByLabel("Auto-run").check();
    await page.getByLabel("Your request").fill("Move the circle");
    await page.getByRole("button", { name: "Send ↑" }).click();
    await expect(page.locator("#status")).toContainText("Complete");
    await expect(page.locator("#red_circle")).toHaveAttribute(
      "transform",
      "translate(440 220)",
    );
    expect(calls).toBe(2);
    expect(JSON.stringify(bodies[1])).toContain("c1");
    expect(JSON.stringify(bodies[1])).toContain("previous");
    await expect(page.locator("#trace")).not.toContainText("provider-test-key");
    await page.getByLabel("Your request").fill("Where is it now?");
    await page.getByRole("button", { name: "Send ↑" }).click();
    await expect(page.locator("#status")).toContainText("Complete");
    expect(JSON.stringify(bodies[2])).toContain("Move the circle");
    await page.getByRole("button", { name: "Settings", exact: false }).click();
    await expect(page.locator("#model-status")).toContainText("Cached");
    const before = models;
    await page.getByRole("button", { name: "Refresh models" }).click();
    await expect.poll(() => models).toBe(before + 1);
    await page.getByRole("button", { name: "Close settings" }).click();
    await page
      .getByRole("button", { name: "Under the hood", exact: true })
      .click();
    await page.getByRole("button", { name: "Current context" }).click();
    await expect(page.locator("#hood-content")).toContainText(
      "Where is it now?",
    );
    await expect(page.locator("#hood-content")).not.toContainText(
      "provider-test-key",
    );
  });
test("under the hood, isolated credentials, and narrow header", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Under the hood", exact: true })
    .click();
  await expect(page.locator("#hood-content")).toContainText(
    "You operate a small shape board",
  );
  await page.getByRole("button", { name: "Tools & code" }).click();
  await expect(page.locator("#hood-content")).toContainText("move_shape");
  await page.getByText("Application function source (TypeScript)").click();
  await expect(page.locator("#hood-content")).toContainText(
    "export function executeTool",
  );
  await page.screenshot({
    path: "test-results/under-the-hood.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close under the hood" }).click();
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByLabel("API key", { exact: true }).fill("gemini-isolated-key");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption("openai");
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.getByLabel("Provider", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "gemini-isolated-key",
  );
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.setViewportSize({ width: 338, height: 720 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(page.locator(".brand-icon svg")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Under the hood", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: "test-results/narrow-header.png",
    fullPage: true,
  });
});
