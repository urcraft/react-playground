# ReAct Playground

A small teaching application that makes an AI tool-use loop visible. Supports Google Gemini, OpenRouter, OpenAI, and Anthropic (Claude). Chat, an SVG shape board, and an execution trace sit side by side. The model chooses tools; application code validates and executes them and returns observations for the next model call.

Public site: https://urcraft.github.io/react-playground/

## Use it

1. Open **Settings**, select a provider, and paste your own key. The key link follows the selected provider.
2. Click **Refresh models**, optionally filter the dropdown, and select a model. A manual ID override is also available. Save settings, choose an example, and click **Send**.
3. Click **Next step** before each model call and tool execution, or turn on **Auto-run**.
4. Expand trace cards to see request context, tool definitions, arguments, and observations. **Stop** cancels further work; **Reset demo** restores the original scene and clears the conversation/trace.

5. Open **Under the hood** for the system prompt, tool schemas and application source, current provider request body and scene, and execution/data-flow rules. Credentials are excluded and opaque signatures are redacted in displayed data.

The initial selection remains `gemini-3.8-flash`. Model access and quota depend on your account. Switching provider, model, or key clears model history but preserves the board. Keys and saved model preferences are separate for each provider; existing Gemini settings are retained.

## Providers and model discovery

| Provider | Generation API | Model list |
| --- | --- | --- |
| Google Gemini | SDK `generateContent` | `GET https://generativelanguage.googleapis.com/v1beta/models` |
| OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions` | `GET https://openrouter.ai/api/v1/models` |
| OpenAI | `POST https://api.openai.com/v1/responses` | `GET https://api.openai.com/v1/models` |
| Anthropic (Claude) | `POST https://api.anthropic.com/v1/messages` | `GET https://api.anthropic.com/v1/models` |

Model lists are cached for 24 hours in local storage, scoped by provider and a SHA-256 account-key fingerprint (never the key itself). Refresh bypasses the cache. An unavailable storage area falls back to memory. Gemini and Anthropic pagination is followed. Authentication/list failures retain the current selection and show an error rather than silently claiming fresh results.

OpenRouter lists are restricted to models advertising `tools`. Gemini lists require `generateContent` and exclude obvious image/audio-only models. OpenAI's endpoint lacks tool-capability metadata, so the list contains text-model candidates rather than a compatibility guarantee. The Claude endpoint lists its available models. A listed model can still lack account access or fail a tool request.

OpenAI uses stateless Responses requests (`store: false`) and preserves response output items, including encrypted reasoning metadata and tool-call IDs. OpenRouter preserves assistant messages and reasoning metadata; Claude preserves content blocks and tool-use IDs. Gemini preserves its native parts and thought signatures. No provider's history is converted for reuse by another provider.

Claude direct browser calls use the documented `anthropic-dangerous-direct-browser-access` opt-in header. There is no backend proxy. Browser/network policies can still prevent requests; the UI reports failures without displaying raw API errors that might contain credentials.

## What this demonstrates

- `get_scene()` reads a 640 × 420 board and the shapes' centre coordinates, dimensions, IDs, and movement permissions.
- `move_shape(shape_id, x, y)` moves the red circle or blue square; the green target stays fixed. Shapes must remain entirely within the board.
- `check_relation(subject_id, relation, target_id)` checks `inside`, `left_of`, `right_of`, `above`, or `below` using full shape extents, allowing touching boundaries.
- Calls execute sequentially. The loop stops at a final answer, cancellation, failure, or ten model requests per user turn.
- Full model response parts, including thought signatures and tool-call IDs, remain in model history. Opaque signatures are labelled rather than displayed in the trace. The trace shows observable events, not private reasoning.
- Interrupted/failed turns are removed from model history to avoid unmatched tool calls. Previous completed turns and completed board movements remain. The model is instructed to inspect current state at the beginning of each turn.

No search, browsing, arbitrary code, documents, backend, analytics, or shared API key. Internet is required for provider calls. Responses appear as each API call completes; this version does not stream individual tokens.

## Key handling

Each key goes directly from the browser to its selected provider's endpoint. It is held in tab session storage by default, with optional persistent local storage and a **Forget this key** button. Storage can be disabled by the browser; in that case the key is held in memory only.

Browser storage is **not a secret vault**. Other scripts on the same origin can access it. GitHub Pages project sites under `urcraft.github.io` share an origin, even when their paths differ. Only use your own key on a trusted browser. Never commit a key or use a shared instructor credential. API calls may consume quota and incur charges under your account's settings. Prompts, conversation history, tool schemas, and observed shape data are sent to the selected provider (and OpenRouter's routed model provider when applicable).

## Development

Node.js 24 and npm:

```sh
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:browser
```

Open the printed local URL with `/react-playground/`. Vite builds static files to `dist/`; its base path is configured for this GitHub Pages project site.

GitHub Actions runs unit tests, TypeScript/build checks, and Chromium browser tests before publishing `dist/` through GitHub Pages. Push to `main` to deploy. No API key or application secrets are needed in Actions. Browser tests intercept provider requests with synthetic responses; they do not use a live account.

## Validation and limits

Unit tests cover geometry, argument errors, stepping, sequential calls, native metadata/ID preservation for all providers, follow-up history, cancellation, request limits, sanitized API errors, model filtering, pagination, cache expiry, refresh, and account isolation. Browser tests cover all four generation adapters with mocked responses, movement/verification, model discovery, settings/storage/removal, reset, failure recovery, safe text rendering, Under the hood, and desktop/projector/narrow-mobile layout.

Genuine model responses still need to be rehearsed with visitor-supplied keys. Automated mock tests establish application behavior, not model reliability or authenticated browser access. Classroom success depends on the model choosing appropriate tools and on API availability.

Checked on 20 September 2026: 37 unit tests and 10 Chromium browser tests passed locally. Desktop, 1280 × 720 projector, mobile settings, inspection dialog, and 338-pixel-wide header layouts were visually reviewed. A live, unauthenticated OpenRouter model-list request succeeded in Chromium and returned 378 tool-capable entries at the time of the check. No authenticated generation was performed.

## References

- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [API key guidance](https://ai.google.dev/gemini-api/docs/api-key)
- [ReAct paper](https://arxiv.org/abs/2210.03629)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI reasoning and stateless history](https://developers.openai.com/api/docs/guides/reasoning)
- [Claude models](https://platform.claude.com/docs/en/api/models/list)
- [Claude tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- [OpenRouter model discovery](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling)
