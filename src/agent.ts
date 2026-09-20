import { GoogleGenAI, Type, type Content, type GenerateContentResponse, type FunctionDeclaration } from '@google/genai';
import { executeTool, type Shape } from './scene';
export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const instructions = `You operate a small shape board through tools. Only discuss this board and the user's spatial requests. You have no browsing tools. Read the scene before acting; never assume coordinates from an earlier turn. Positions are absolute centres, x increases right, y down. The green rectangle is fixed. Directional relations compare entire shapes, not just centres; boundary touching is allowed. Use check_relation after movements to verify the requested relationship. Never claim success unless tool results support it. On invalid actions, use the returned error to correct your request. Ask for clarification when needed. Keep final answers brief. Do not output private reasoning or fabricated tool results. Tools execute in listed order.`;
const string = (description: string) => ({ type: Type.STRING, description });
export const declarations: FunctionDeclaration[] = [
  { name: 'get_scene', description: 'Read the current board, shape IDs, sizes and centre coordinates.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'move_shape', description: 'Move a movable shape to absolute centre coordinates. Returns actual resulting state or an error.', parameters: { type: Type.OBJECT, properties: { shape_id: string('Shape ID from get_scene'), x: { type: Type.NUMBER }, y: { type: Type.NUMBER } }, required: ['shape_id', 'x', 'y'] } },
  { name: 'check_relation', description: 'Verify a relationship using actual geometry. Entire shapes must satisfy it; touching is allowed.', parameters: { type: Type.OBJECT, properties: { subject_id: string('Subject shape ID'), relation: { type: Type.STRING, enum: ['inside', 'left_of', 'right_of', 'above', 'below'] }, target_id: string('Target shape ID') }, required: ['subject_id', 'relation', 'target_id'] } },
];
export type Event = { kind: 'request' | 'model' | 'tool' | 'observation' | 'answer' | 'error'; title: string; data?: unknown };
export type Transport = (contents: Content[], signal: AbortSignal) => Promise<GenerateContentResponse>;
export function transport(key: string, model: string): Transport {
  const ai = new GoogleGenAI({ apiKey: key });
  return (contents, signal) => ai.models.generateContent({ model, contents, config: { systemInstruction: instructions, tools: [{ functionDeclarations: declarations }], abortSignal: signal, httpOptions: { timeout: 60000 } } });
}
export function friendlyError(error: unknown): string {
  const e = error as { status?: number; message?: string };
  const code = e.status;
  if (code === 401 || code === 403 || /API_KEY_INVALID|API key not valid/i.test(e.message ?? '')) return 'Gemini rejected the key. Check your key and its API permissions in Settings.';
  if (code === 429) return 'Gemini quota or rate limit reached. Check your AI Studio quota, then try again later.';
  if (code === 404) return 'This model is unavailable. Choose an accessible model ID in Settings.';
  if (code === 400) return 'Gemini rejected the request. Check the model ID and API key settings.';
  return 'The Gemini request failed or timed out. Check your connection and model access, then try again.';
}
export class Agent {
  history: Content[] = [];
  running = false;
  auto = false;
  private controller?: AbortController;
  private release?: () => void;
  constructor(public scene: Shape[], private emit: (event: Event) => void, private status: (label: string, waiting: boolean) => void, private changed: () => void) {}
  next() { this.release?.(); }
  setAuto(value: boolean) { this.auto = value; if (value) this.next(); }
  stop() { this.controller?.abort(); this.next(); }
  private async gate(label: string, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.auto) {
      this.status(label, true);
      await new Promise<void>(resolve => { this.release = resolve; });
      this.release = undefined;
    }
    signal.throwIfAborted();
    this.status(label, false);
  }
  async run(prompt: string, send: Transport, model: string) {
    if (this.running) return;
    this.running = true;
    const controller = this.controller = new AbortController(), signal = controller.signal;
    const start = this.history.length;
    this.history.push({ role: 'user', parts: [{ text: prompt }] });
    try {
      for (let call = 1; call <= 10; call++) {
        await this.gate(`Ready for model request ${call}`, signal);
        this.emit({ kind: 'request', title: `Request ${call} → Gemini`, data: { model, systemInstruction: instructions, contents: structuredClone(this.history), tools: declarations } });
        this.status('Waiting for Gemini…', false);
        const response = await send(this.history, signal);
        signal.throwIfAborted();
        const content = response.candidates?.[0]?.content;
        if (!content?.parts?.length) throw new Error('Empty response');
        // Retain full model parts including thought signatures, IDs and ordering.
        this.history.push(content);
        this.emit({ kind: 'model', title: 'Model response received', data: content });
        const calls = content.parts.flatMap(p => p.functionCall ? [p.functionCall] : []);
        const text = content.parts.filter(p => !p.thought).map(p => p.text ?? '').join('');
        if (!calls.length) {
          if (!text.trim()) throw new Error('No final answer');
          this.emit({ kind: 'answer', title: text });
          this.status('Complete · ready for another request', false);
          return;
        }
        const results = [];
        for (const tool of calls) {
          this.emit({ kind: 'tool', title: `Tool requested: ${tool.name}`, data: tool });
          await this.gate(`Ready to execute ${tool.name}`, signal);
          this.status(`Executing ${tool.name}…`, false);
          const result = executeTool(this.scene, tool.name ?? '', tool.args ?? {});
          this.changed();
          if (tool.name === 'move_shape' && result.ok) await new Promise(resolve => setTimeout(resolve, 450));
          signal.throwIfAborted();
          this.emit({ kind: 'observation', title: result.ok ? `Observation: ${tool.name}` : `Tool error: ${tool.name}`, data: result });
          results.push({ functionResponse: { id: tool.id, name: tool.name, response: result } });
        }
        this.history.push({ role: 'user', parts: results });
      }
      this.emit({ kind: 'error', title: 'Stopped at the 10-request limit. Completed movements remain on the board.' });
      this.status('Request limit reached', false);
      this.history.splice(start);
    } catch (error) {
      // Discard incomplete turns so orphan function calls never reach the next request.
      this.history.splice(start);
      const message = signal.aborted ? 'Stopped. Completed movements remain; this unfinished turn was removed from model history.' : friendlyError(error);
      this.emit({ kind: 'error', title: message });
      this.status(signal.aborted ? 'Stopped' : 'Request failed', false);
    } finally { this.running = false; this.release = undefined; this.changed(); }
  }
}
