# ReAct Playground

A small teaching application that makes a real Gemini tool-use loop visible. Chat, an SVG shape board, and an execution trace sit side by side. The model chooses tools; application code validates and executes them and returns observations for the next model call.

Public site: https://urcraft.github.io/react-playground/

## Use it

1. Open **Settings** and paste your own key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Save settings, choose an example, and click **Send**.
3. Click **Next step** before each model call and tool execution, or turn on **Auto-run**.
4. Expand trace cards to see request context, tool definitions, arguments, and observations. **Stop** cancels further work; **Reset demo** restores the original scene and clears the conversation/trace.

Default model: `gemini-3.8-flash`, verified against Google's model documentation on 20 September 2026. Model access and quota depend on your account. The model ID is editable. Switching models clears model history but preserves the board.

## What this demonstrates

- `get_scene()` reads a 640 × 420 board and the shapes' centre coordinates, dimensions, IDs, and movement permissions.
- `move_shape(shape_id, x, y)` moves the red circle or blue square; the green target stays fixed. Shapes must remain entirely within the board.
- `check_relation(subject_id, relation, target_id)` checks `inside`, `left_of`, `right_of`, `above`, or `below` using full shape extents, allowing touching boundaries.
- Calls execute sequentially. The loop stops at a final answer, cancellation, failure, or ten model requests per user turn.
- Full model response parts, including thought signatures and tool-call IDs, remain in model history. Opaque signatures are labelled rather than displayed in the trace. The trace shows observable events, not private reasoning.
- Interrupted/failed turns are removed from model history to avoid unmatched tool calls. Previous completed turns and completed board movements remain. The model is instructed to inspect current state at the beginning of each turn.

No search, browsing, arbitrary code, documents, backend, analytics, or shared API key. Internet is required for Gemini. Responses appear as each API call completes; this version does not stream individual tokens.

## Key handling

The key goes directly from the browser to Google's Gemini endpoint. It is held in tab session storage by default, with optional persistent local storage and a Forget key button. Storage can be disabled by the browser; in that case the key is held in memory only.

Browser storage is **not a secret vault**. Other scripts on the same origin can access it. GitHub Pages project sites under `urcraft.github.io` share an origin, even when their paths differ. Only use your own key on a trusted browser. Never commit a key or use a shared instructor credential. API calls may consume quota and incur charges under your account's settings. Prompts, conversation history, tool schemas, and observed shape data are sent to Google.

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

GitHub Actions runs unit tests, TypeScript/build checks, and Chromium browser tests before publishing `dist/` through GitHub Pages. Push to `main` to deploy. No API key or application secrets are needed in Actions. Browser tests intercept Gemini requests with synthetic responses; they do not use a live account.

## Validation and limits

Unit tests cover geometry, argument errors, stepping, sequential calls, signature/ID preservation, follow-up history, cancellation, request limits, and sanitized API errors. Browser tests cover the actual SDK request path with mocked responses, movement/verification, settings/storage/removal, reset, failure recovery, safe text rendering, and desktop/mobile layout.

A genuine Gemini response still needs to be rehearsed with a visitor-supplied key. Automated mock tests establish application behavior, not model reliability. Classroom success depends on the model choosing appropriate tools and on API availability.

## References

- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [API key guidance](https://ai.google.dev/gemini-api/docs/api-key)
- [ReAct paper](https://arxiv.org/abs/2210.03629)
