import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRequest,
  normalizeResponse,
  listModels,
  headers,
  toolSchemas,
} from "./providers";
import { executeTool, initialScene } from "./scene";
import type { Content } from "@google/genai";
afterEach(() => vi.unstubAllGlobals());
describe("provider adapters", () => {
  it("uses JSON Schema types for non-Gemini APIs", () => {
    expect(toolSchemas[1].parameters.type).toBe("object");
    expect(toolSchemas[1].parameters.properties.x.type).toBe("number");
  });
  it("preserves OpenAI reasoning items and associates function outputs", () => {
    const raw = {
      status: "completed",
      output: [
        { type: "reasoning", id: "r", encrypted_content: "opaque" },
        {
          type: "function_call",
          id: "fc",
          call_id: "c1",
          name: "get_scene",
          arguments: "{}",
        },
      ],
    };
    const model = normalizeResponse("openai", raw).candidates![0].content!;
    const history: Content[] = [
      { role: "user", parts: [{ text: "inspect" }] },
      model,
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "c1",
              name: "get_scene",
              response: { ok: true },
            },
          },
        ],
      },
    ];
    const request = buildRequest("openai", "test", history) as any;
    expect(request.input[1]).toEqual(raw.output[0]);
    expect(request.input[2]).toEqual(raw.output[1]);
    expect(request.input[3]).toMatchObject({
      type: "function_call_output",
      call_id: "c1",
    });
    expect(request.store).toBe(false);
    expect(request.tools[0].strict).toBe(false);
  });
  it("preserves Anthropic blocks and reports tool errors using tool_result", () => {
    const raw = {
      content: [
        { type: "thinking", thinking: "summary", signature: "opaque" },
        {
          type: "tool_use",
          id: "u1",
          name: "move_shape",
          input: { shape_id: "red_circle", x: 40, y: 40 },
        },
      ],
    };
    const model = normalizeResponse("anthropic", raw).candidates![0].content!;
    const request = buildRequest("anthropic", "test", [
      model,
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "u1",
              name: "move_shape",
              response: { ok: false, error: "invalid" },
            },
          },
        ],
      },
    ]) as any;
    expect(request.messages[0].content).toEqual(raw.content);
    expect(request.messages[1].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "u1",
      is_error: true,
    });
    expect(
      headers("anthropic", "key")["anthropic-dangerous-direct-browser-access"],
    ).toBe("true");
  });
  it("preserves OpenRouter assistant metadata and individual tool IDs", () => {
    const msg = {
      role: "assistant",
      content: null,
      reasoning_details: [{ type: "reasoning.encrypted", data: "opaque" }],
      tool_calls: [
        {
          id: "t1",
          type: "function",
          function: { name: "get_scene", arguments: "{}" },
        },
        {
          id: "t2",
          type: "function",
          function: { name: "get_scene", arguments: "{}" },
        },
      ],
    };
    const model = normalizeResponse("openrouter", {
      choices: [{ message: msg }],
    }).candidates![0].content!;
    const request = buildRequest("openrouter", "test", [
      model,
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "t1",
              name: "get_scene",
              response: { ok: true },
            },
          },
          {
            functionResponse: {
              id: "t2",
              name: "get_scene",
              response: { ok: true },
            },
          },
        ],
      },
    ]) as any;
    expect(request.messages[1]).toEqual(msg);
    expect(request.messages.slice(2).map((x: any) => x.tool_call_id)).toEqual([
      "t1",
      "t2",
    ]);
  });
  it("malformed JSON becomes a tool error and never changes the scene", () => {
    const response = normalizeResponse("openai", {
      output: [
        {
          type: "function_call",
          call_id: "c",
          name: "move_shape",
          arguments: "not json",
        },
      ],
    });
    const call = response.candidates![0].content!.parts![0].functionCall!;
    const scene = initialScene();
    expect(executeTool(scene, call.name!, call.args!).ok).toBe(false);
    expect(scene).toEqual(initialScene());
  });
  it("rejects truncated responses before tools execute", () => {
    expect(() =>
      normalizeResponse("anthropic", {
        stop_reason: "max_tokens",
        content: [],
      }),
    ).toThrow();
    expect(() =>
      normalizeResponse("openai", { status: "incomplete", output: [] }),
    ).toThrow();
    expect(() =>
      normalizeResponse("openrouter", {
        choices: [{ finish_reason: "length" }],
      }),
    ).toThrow();
  });
});
describe("model discovery and cache", () => {
  it("expires cache after 24 hours and does not silently accept a failed refresh", async () => {
    const f = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "vendor/tool", supported_parameters: ["tools"] }],
        }),
      });
    vi.stubGlobal("fetch", f);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await listModels("openrouter", "expiry-account");
      clock.mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
      expect((await listModels("openrouter", "expiry-account")).cached).toBe(
        false,
      );
      expect(f).toHaveBeenCalledTimes(2);
      f.mockResolvedValue({ ok: false, status: 429 });
      await expect(
        listModels("openrouter", "expiry-account", true),
      ).rejects.toMatchObject({ status: 429 });
    } finally {
      clock.mockRestore();
    }
  });
  it("filters OpenRouter tool models, caches, refreshes, and isolates accounts", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "vendor/tool",
            name: "Tool model",
            supported_parameters: ["tools"],
          },
          { id: "vendor/no-tools", name: "No tools", supported_parameters: [] },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const key = "unit-account-one";
    const first = await listModels("openrouter", key);
    expect(first.models.map((m) => m.id)).toEqual(["vendor/tool"]);
    expect((await listModels("openrouter", key)).cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await listModels("openrouter", key, true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await listModels("openrouter", "unit-account-two");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("follows Gemini pagination and excludes non-text models", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            {
              name: "models/gemini-text",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
          nextPageToken: "next",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            {
              name: "models/gemini-image",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", f);
    const list = await listModels("gemini", "pagination-key", true);
    expect(list.models.map((m) => m.id)).toEqual(["gemini-text"]);
    expect(f.mock.calls[1][0]).toContain("pageToken=next");
  });
  it("follows Anthropic after_id pagination", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "claude-a", display_name: "A" }],
          has_more: true,
          last_id: "claude-a",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "claude-b", display_name: "B" }],
          has_more: false,
        }),
      });
    vi.stubGlobal("fetch", f);
    expect(
      (await listModels("anthropic", "pagination-key", true)).models,
    ).toHaveLength(2);
    expect(f.mock.calls[1][0]).toContain("after_id=claude-a");
  });
  it("filters non-text OpenAI models and reports authorization errors without keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [
              { id: "gpt-test" },
              { id: "text-embedding-test" },
              { id: "gpt-realtime-test" },
              { id: "o3-test" },
            ],
          }),
        }),
    );
    expect(
      (await listModels("openai", "filter-key", true)).models.map((m) => m.id),
    ).toEqual(["gpt-test", "o3-test"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    await expect(
      listModels("openai", "invalid-key", true),
    ).rejects.toMatchObject({ status: 401 });
  });
});
