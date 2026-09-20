import { expect, it, vi } from "vitest";
import { Agent, friendlyError, type Event } from "./agent";
import { initialScene } from "./scene";
import type { GenerateContentResponse, Part } from "@google/genai";
const response = (parts: Part[]) =>
  ({
    candidates: [{ content: { role: "model", parts } }],
  }) as GenerateContentResponse;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
it("pauses before model and tool, preserves signatures/IDs and multi-turn context", async () => {
  const events: Event[] = [];
  const a = new Agent(
    initialScene(),
    (e) => events.push(e),
    () => {},
    () => {},
  );
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      response([
        {
          functionCall: { id: "call1", name: "get_scene", args: {} },
          thoughtSignature: "opaque",
        },
      ]),
    )
    .mockResolvedValue(response([{ text: "The circle is outside." }]));
  const run = a.run("inspect", send, "test");
  expect(send).not.toHaveBeenCalled();
  a.next();
  await tick();
  expect(send).toHaveBeenCalledTimes(1);
  expect(events.some((e) => e.kind === "observation")).toBe(false);
  a.next();
  await tick();
  expect(events.some((e) => e.kind === "observation")).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  a.next();
  await run;
  expect(a.history[1].parts?.[0].thoughtSignature).toBe("opaque");
  expect(a.history[2].parts?.[0].functionResponse?.id).toBe("call1");
  a.setAuto(true);
  await a.run("follow up", send, "test");
  expect(send.mock.calls[2][0].length).toBeGreaterThan(4);
});
it("executes multiple tools sequentially and returns errors to the model", async () => {
  const a = new Agent(
    initialScene(),
    () => {},
    () => {},
    () => {},
  );
  a.setAuto(true);
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      response([
        {
          functionCall: {
            name: "move_shape",
            args: { shape_id: "red_circle", x: 1, y: 1 },
          },
        },
        { functionCall: { name: "get_scene", args: {} } },
      ]),
    )
    .mockResolvedValue(response([{ text: "Cannot move there." }]));
  await a.run("move", send, "test");
  expect(a.history[2].parts).toHaveLength(2);
  expect(a.history[2].parts?.[0].functionResponse?.response?.ok).toBe(false);
  expect(a.scene[0].x).toBe(120);
});
it("prevents overlapping runs and stops a paused turn cleanly", async () => {
  const a = new Agent(
    initialScene(),
    () => {},
    () => {},
    () => {},
  );
  const send = vi.fn();
  const run = a.run("first", send, "test");
  await a.run("second", send, "test");
  expect(a.history).toHaveLength(1);
  a.stop();
  await run;
  expect(a.history).toEqual([]);
  expect(a.running).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
it("aborts an in-flight request and retains earlier completed turns", async () => {
  const a = new Agent(
    initialScene(),
    () => {},
    () => {},
    () => {},
  );
  a.setAuto(true);
  await a.run("hello", async () => response([{ text: "Hello" }]), "test");
  const run = a.run(
    "wait",
    (_, signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
    "test",
  );
  await tick();
  a.stop();
  await run;
  expect(a.history).toHaveLength(2);
});
it("caps model calls at ten", async () => {
  const events: Event[] = [];
  const a = new Agent(
    initialScene(),
    (e) => events.push(e),
    () => {},
    () => {},
  );
  a.setAuto(true);
  const send = vi
    .fn()
    .mockResolvedValue(
      response([{ functionCall: { name: "get_scene", args: {} } }]),
    );
  await a.run("loop", send, "test");
  expect(send).toHaveBeenCalledTimes(10);
  expect(events.at(-1)?.title).toContain("10-request limit");
  expect(a.history).toEqual([]);
});
it.each([401, 403, 404, 429, 500])(
  "sanitizes API failure %s",
  async (status) => {
    const events: Event[] = [];
    const a = new Agent(
      initialScene(),
      (e) => events.push(e),
      () => {},
      () => {},
    );
    a.setAuto(true);
    await a.run(
      "test",
      async () => {
        throw { status, message: "secret-key-in-error" };
      },
      "test",
    );
    expect(JSON.stringify(events)).not.toContain("secret-key-in-error");
    expect(a.history).toEqual([]);
    expect(friendlyError({ status })).toBeTruthy();
  },
);
it("ignores a late response after cancellation", async () => {
  const events: Event[] = [];
  const a = new Agent(
    initialScene(),
    (e) => events.push(e),
    () => {},
    () => {},
  );
  a.setAuto(true);
  let finish!: (r: GenerateContentResponse) => void;
  const run = a.run(
    "wait",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    "test",
  );
  await tick();
  a.stop();
  finish(response([{ text: "Late answer" }]));
  await run;
  expect(events.some((e) => e.kind === "answer")).toBe(false);
});
