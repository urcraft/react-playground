import type { Content, GenerateContentResponse, Part } from "@google/genai";
import {
  declarations,
  instructions,
  transport as geminiTransport,
  type Transport,
} from "./agent";

export type Provider = "gemini" | "openrouter" | "openai" | "anthropic";
export const providers: Record<
  Provider,
  { label: string; endpoint: string; models: string; keyLink: string }
> = {
  gemini: {
    label: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    models: "https://generativelanguage.googleapis.com/v1beta/models",
    keyLink: "https://aistudio.google.com/apikey",
  },
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    models: "https://openrouter.ai/api/v1/models",
    keyLink: "https://openrouter.ai/settings/keys",
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/responses",
    models: "https://api.openai.com/v1/models",
    keyLink: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    endpoint: "https://api.anthropic.com/v1/messages",
    models: "https://api.anthropic.com/v1/models",
    keyLink: "https://platform.claude.com/settings/keys",
  },
};
// Provider-native blocks are retained alongside the common application representation.
type NativeContent = Content & { native?: { provider: Provider; value: any } };
export function jsonSchema(value: unknown): any {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "type" && typeof v === "string" ? v.toLowerCase() : jsonSchema(v),
      ]),
    );
  return value;
}
export const toolSchemas = declarations.map((d) => ({
  name: d.name!,
  description: d.description!,
  parameters: jsonSchema(d.parameters),
}));
export function headers(
  provider: Provider,
  key: string,
): Record<string, string> {
  if (provider === "gemini") return { "x-goog-api-key": key };
  if (provider === "anthropic")
    return {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  return { Authorization: `Bearer ${key}` };
}
export async function requestJSON(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<any> {
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
    : AbortSignal.timeout(20000);
  const response = await fetch(url, { ...init, signal: combined });
  if (!response.ok)
    throw Object.assign(new Error("Provider request failed"), {
      status: response.status,
    });
  const data = await response.json();
  if (data.error)
    throw Object.assign(new Error("Provider returned an error"), {
      status: data.error.code,
    });
  return data;
}
export function buildRequest(
  provider: Provider,
  model: string,
  contents: Content[],
): Record<string, unknown> {
  if (provider === "gemini")
    return {
      model,
      systemInstruction: instructions,
      contents,
      tools: [{ functionDeclarations: declarations }],
    };
  if (provider === "openai") {
    const input = contents.flatMap((content: NativeContent): any[] => {
      if (content.native?.provider === provider) return content.native.value;
      return (content.parts ?? []).flatMap((p): any[] =>
        p.functionResponse
          ? [
              {
                type: "function_call_output",
                call_id: p.functionResponse.id,
                output: JSON.stringify(p.functionResponse.response),
              },
            ]
          : p.text
            ? [
                {
                  role: content.role === "model" ? "assistant" : "user",
                  content: p.text,
                },
              ]
            : [],
      );
    });
    return {
      model,
      instructions,
      input,
      store: false,
      include: ["reasoning.encrypted_content"],
      tools: toolSchemas.map((t) => ({
        type: "function",
        ...t,
        strict: false,
      })),
    };
  }
  if (provider === "anthropic") {
    const messages = contents.map((content: NativeContent) => {
      if (content.native?.provider === provider)
        return { role: "assistant", content: content.native.value };
      return {
        role: content.role === "model" ? "assistant" : "user",
        content: (content.parts ?? []).flatMap((p): any[] =>
          p.functionResponse
            ? [
                {
                  type: "tool_result",
                  tool_use_id: p.functionResponse.id,
                  content: JSON.stringify(p.functionResponse.response),
                  is_error: p.functionResponse.response?.ok === false,
                },
              ]
            : p.text
              ? [{ type: "text", text: p.text }]
              : [],
        ),
      };
    });
    return {
      model,
      system: instructions,
      max_tokens: 4096,
      messages,
      tools: toolSchemas.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    };
  }
  const messages: any[] = [{ role: "system", content: instructions }];
  for (const content of contents as NativeContent[]) {
    if (content.native?.provider === provider) {
      messages.push(content.native.value);
      continue;
    }
    for (const p of content.parts ?? []) {
      if (p.functionResponse)
        messages.push({
          role: "tool",
          tool_call_id: p.functionResponse.id,
          content: JSON.stringify(p.functionResponse.response),
        });
      else if (p.text)
        messages.push({
          role: content.role === "model" ? "assistant" : "user",
          content: p.text,
        });
    }
  }
  return {
    model,
    messages,
    tools: toolSchemas.map((t) => ({ type: "function", function: t })),
    provider: { require_parameters: true },
  };
}
function args(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    /* Invalid arguments become a tool error, never executable code. */
  }
  return { __invalid_arguments: true };
}
export function normalizeResponse(
  provider: Provider,
  data: any,
): GenerateContentResponse {
  let parts: Part[] = [],
    native: any;
  if (provider === "openai") {
    if (data.status === "failed" || data.status === "incomplete")
      throw new Error("Incomplete provider response");
    native = data.output ?? [];
    for (const item of native) {
      if (item.type === "function_call")
        parts.push({
          functionCall: {
            id: item.call_id,
            name: item.name,
            args: args(item.arguments),
          },
        });
      if (item.type === "message")
        for (const block of item.content ?? [])
          if (block.type === "output_text") parts.push({ text: block.text });
          else if (block.type === "refusal")
            parts.push({ text: block.refusal });
    }
  } else if (provider === "anthropic") {
    if (data.stop_reason === "max_tokens")
      throw new Error("Incomplete provider response");
    native = data.content ?? [];
    for (const block of native) {
      if (block.type === "tool_use")
        parts.push({
          functionCall: {
            id: block.id,
            name: block.name,
            args: args(block.input),
          },
        });
      if (block.type === "text") parts.push({ text: block.text });
    }
  } else {
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length")
      throw new Error("Incomplete provider response");
    native = choice?.message;
    if (!native) throw new Error("Empty provider response");
    if (native.content) parts.push({ text: native.content });
    for (const call of native.tool_calls ?? [])
      parts.push({
        functionCall: {
          id: call.id,
          name: call.function?.name,
          args: args(call.function?.arguments),
        },
      });
  }
  const content: NativeContent = {
    role: "model",
    parts,
    native: { provider, value: native },
  };
  return { candidates: [{ content }] } as GenerateContentResponse;
}
export function createTransport(
  provider: Provider,
  key: string,
  model: string,
): Transport {
  const send: Transport =
    provider === "gemini"
      ? geminiTransport(key, model)
      : async (contents, signal) =>
          normalizeResponse(
            provider,
            await requestJSON(
              providers[provider].endpoint,
              {
                method: "POST",
                headers: {
                  ...headers(provider, key),
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(buildRequest(provider, model, contents)),
              },
              signal,
            ),
          );
  send.describe = (contents) => ({
    provider: providers[provider].label,
    endpoint:
      provider === "gemini"
        ? `${providers.gemini.endpoint}/${model}:generateContent`
        : providers[provider].endpoint,
    body: structuredClone(buildRequest(provider, model, contents)),
  });
  return send;
}

export type ModelOption = { id: string; name: string };
export type ModelList = {
  models: ModelOption[];
  fetchedAt: number;
  cached: boolean;
};
const TTL = 24 * 60 * 60 * 1000;
const memory = new Map<string, ModelList>();
export async function listModels(
  provider: Provider,
  key: string,
  force = false,
): Promise<ModelList> {
  if (!key && provider !== "openrouter")
    throw Object.assign(new Error("Key required"), { status: 401 });
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const cacheKey = `react-playground:models:v1:${provider}:${hash}`;
  let cache = memory.get(cacheKey);
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (
      saved &&
      Array.isArray(saved.models) &&
      saved.models.every(
        (m: any) => typeof m.id === "string" && typeof m.name === "string",
      ) &&
      typeof saved.fetchedAt === "number"
    )
      cache = saved;
  } catch {
    /* Memory cache still works without storage. */
  }
  if (!force && cache && Date.now() - cache.fetchedAt < TTL)
    return { ...cache, cached: true };
  const all: ModelOption[] = [];
  let cursor = "";
  const seen = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const url = new URL(providers[provider].models);
    if (provider === "gemini") {
      url.searchParams.set("pageSize", "1000");
      if (cursor) url.searchParams.set("pageToken", cursor);
    }
    if (provider === "anthropic") {
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("after_id", cursor);
    }
    const data = await requestJSON(url.href, {
      headers: key ? headers(provider, key) : {},
    });
    for (const m of data.models ?? data.data ?? []) {
      const id =
        provider === "gemini" ? String(m.name).replace(/^models\//, "") : m.id;
      if (typeof id !== "string") continue;
      if (
        provider === "gemini" &&
        (!m.supportedGenerationMethods?.includes("generateContent") ||
          /image|tts|robotics|computer-use/i.test(id))
      )
        continue;
      if (
        provider === "openrouter" &&
        !m.supported_parameters?.includes("tools")
      )
        continue;
      // OpenAI's list does not expose tool capability metadata; these are text-model candidates.
      if (
        provider === "openai" &&
        (!/^(gpt-|o[134])/.test(id) ||
          /audio|realtime|transcribe|image|search|instruct|codex/.test(id))
      )
        continue;
      all.push({ id, name: m.displayName || m.display_name || m.name || id });
    }
    const next =
      provider === "gemini"
        ? data.nextPageToken
        : provider === "anthropic" && data.has_more
          ? data.last_id
          : undefined;
    if (!next) break;
    if (seen.has(next) || page === 49)
      throw new Error("Model pagination did not finish");
    cursor = next;
    seen.add(cursor);
  }
  if (!all.length) throw new Error("No compatible models returned");
  const result = {
    models: [...new Map(all.map((m) => [m.id, m])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    fetchedAt: Date.now(),
    cached: false,
  };
  memory.set(cacheKey, result);
  try {
    localStorage.setItem(cacheKey, JSON.stringify(result));
  } catch {
    /* Model cache is optional. */
  }
  return result;
}
