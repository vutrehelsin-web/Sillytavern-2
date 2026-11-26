import 'dotenv/config';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const DEFAULT_TTS_ENDPOINT =
  process.env.TTS_ENDPOINT_URL?.trim() ||
  'https://ais-pre-u7l73h3ecm66d62zwylz6x-227764188141.us-east1.run.app/v1/audio/speech';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:192.168.') ||
      lower.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

async function validateExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid endpoint URL format.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Endpoint URL must use http: or https: protocol.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Localhost and internal hostnames are not permitted.');
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Private or loopback IP addresses are not permitted.');
    }
    return parsed;
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length) {
      throw new Error('Could not resolve endpoint hostname.');
    }
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error('Endpoint resolves to a private or restricted IP address.');
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('not permitted')) {
      throw err;
    }
    throw new Error('Unable to resolve external endpoint host.');
  }
  return parsed;
}

function applyMacros(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName);
}

interface IncomingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface IncomingCharacter {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  exampleDialogue?: string;
  systemPrompt?: string;
}

interface IncomingLoreEntry {
  name?: string;
  keys?: string[];
  content?: string;
  enabled?: boolean;
}

interface ChatRequestBody {
  provider?: 'gemini' | 'custom';
  model?: string;
  customBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  globalSystemPrompt?: string;
  continueMode?: boolean;
  character?: IncomingCharacter;
  userPersona?: { name?: string; description?: string };
  worldInfo?: IncomingLoreEntry[];
  messages?: IncomingMessage[];
}

function buildSystemInstruction(body: ChatRequestBody): string {
  const charName = (body.character?.name || 'Character').trim();
  const userName = (body.userPersona?.name || 'User').trim();
  const parts: string[] = [];

  if (body.globalSystemPrompt?.trim()) {
    parts.push(applyMacros(body.globalSystemPrompt.trim(), charName, userName));
  }
  if (body.character?.systemPrompt?.trim()) {
    parts.push(applyMacros(body.character.systemPrompt.trim(), charName, userName));
  }

  parts.push(`Character Name: ${charName}`);
  if (body.character?.description?.trim()) {
    parts.push(
      `Description:\n${applyMacros(body.character.description.trim(), charName, userName)}`
    );
  }
  if (body.character?.personality?.trim()) {
    parts.push(
      `Personality:\n${applyMacros(body.character.personality.trim(), charName, userName)}`
    );
  }
  if (body.character?.scenario?.trim()) {
    parts.push(
      `Current Scenario:\n${applyMacros(body.character.scenario.trim(), charName, userName)}`
    );
  }
  if (body.userPersona?.description?.trim()) {
    parts.push(
      `About ${userName}:\n${applyMacros(body.userPersona.description.trim(), charName, userName)}`
    );
  }

  const recentText = (body.messages || [])
    .slice(-6)
    .map((m) => m.content.toLowerCase())
    .join('\n');

  const matchedLore = (body.worldInfo || []).filter((entry) => {
    if (!entry.enabled || !entry.content?.trim()) return false;
    const keys = (entry.keys || []).map((k) => k.trim().toLowerCase()).filter(Boolean);
    return keys.some((key) => recentText.includes(key));
  });

  if (matchedLore.length > 0) {
    const loreText = matchedLore
      .map((e) => `- ${e.name || 'Lore'}: ${applyMacros(e.content || '', charName, userName)}`)
      .join('\n');
    parts.push(`World Info & Lore:\n${loreText}`);
  }

  if (body.character?.exampleDialogue?.trim()) {
    parts.push(
      `Example Dialogue:\n${applyMacros(body.character.exampleDialogue.trim(), charName, userName)}`
    );
  }

  return parts.join('\n\n');
}

function writeSseEvent(res: Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleGeminiChat(
  res: Response,
  model: string,
  systemInstruction: string,
  messages: IncomingMessage[],
  continueMode: boolean
): Promise<void> {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error:
        'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY to your Render environment variables or Settings -> Secrets.',
    });
    return;
  }

  const allowedModels = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
  const selectedModel = allowedModels.has(model) ? model : 'gemini-4-hydrogen';

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  if (continueMode || contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [
        {
          text: '(Continue the scene naturally in character without repeating prior lines.)',
        },
      ],
    });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await ai.models.generateContentStream({
      model: selectedModel,
      contents,
      config: {
        systemInstruction,
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        writeSseEvent(res, { token: chunk.text });
      }
    }
    writeSseEvent(res, { done: true, model: selectedModel });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini generation failed.';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    } else {
      writeSseEvent(res, { error: message });
      res.end();
    }
  }
}

async function handleCustomChat(
  res: Response,
  body: ChatRequestBody,
  systemInstruction: string,
  messages: IncomingMessage[],
  continueMode: boolean
): Promise<void> {
  const rawBase =
    body.customBaseUrl?.trim() || process.env.CUSTOM_CHAT_BASE_URL?.trim() || '';
  if (!rawBase) {
    res.status(400).json({
      error:
        'Custom chat Base URL is missing. Enter an OpenAI-compatible Base URL in Voice & Model settings or set CUSTOM_CHAT_BASE_URL on Render.',
    });
    return;
  }

  let validatedBase: URL;
  try {
    validatedBase = await validateExternalUrl(rawBase);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid custom chat endpoint URL.',
    });
    return;
  }

  const normalized = validatedBase.toString().replace(/\/+$/, '');
  const targetUrl = normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;

  const modelName =
    body.model?.trim() || process.env.CUSTOM_CHAT_MODEL?.trim() || 'gpt-4o-mini';
  const apiKey = process.env.CUSTOM_CHAT_API_KEY?.trim() || '';

  const openAiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemInstruction },
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  if (continueMode) {
    openAiMessages.push({
      role: 'user',
      content: '(Continue the scene naturally in character without repeating prior lines.)',
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: openAiMessages,
        temperature:
          typeof body.temperature === 'number'
            ? Math.min(2, Math.max(0, body.temperature))
            : 0.85,
        max_tokens:
          typeof body.maxTokens === 'number'
            ? Math.min(4096, Math.max(64, body.maxTokens))
            : 700,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({
        error: `Custom chat endpoint returned ${upstream.status}: ${errText.slice(0, 300)}`,
      });
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (contentType.includes('application/json')) {
      const data = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content || '';
      if (text) {
        writeSseEvent(res, { token: text });
      }
      writeSseEvent(res, { done: true, model: modelName });
      res.end();
      return;
    }

    if (!upstream.body) {
      writeSseEvent(res, { error: 'Empty response stream from custom chat endpoint.' });
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const dataPart = line.slice(5).trim();
        if (dataPart === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataPart) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const token =
            parsed.choices?.[0]?.delta?.content ??
            parsed.choices?.[0]?.message?.content ??
            '';
          if (token) {
            writeSseEvent(res, { token });
          }
        } catch {
          // Ignore partial or non-JSON SSE keepalives
        }
      }
    }

    writeSseEvent(res, { done: true, model: modelName });
    res.end();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to reach custom chat endpoint.';
    if (!res.headersSent) {
      res.status(502).json({ error: message });
    } else {
      writeSseEvent(res, { error: message });
      res.end();
    }
  }
}

async function postTtsPayload(
  targetUrl: string,
  payload: Record<string, unknown>,
  ttsApiKey: string
): Promise<globalThis.Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'audio/mpeg, audio/wav, audio/*, application/json',
  };
  if (ttsApiKey) {
    headers.Authorization = `Bearer ${ttsApiKey}`;
    headers['xi-api-key'] = ttsApiKey;
  }

  return fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'sillytavern-voice',
      node: process.version,
      hasGeminiKey: Boolean(getGeminiClient()),
      hasCustomChatKey: Boolean(process.env.CUSTOM_CHAT_API_KEY?.trim()),
      hasTtsApiKey: Boolean(process.env.TTS_API_KEY?.trim()),
      defaultTtsEndpoint: DEFAULT_TTS_ENDPOINT,
    });
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      hasGeminiKey: Boolean(getGeminiClient()),
      hasCustomChatKey: Boolean(process.env.CUSTOM_CHAT_API_KEY?.trim()),
      hasTtsApiKey: Boolean(process.env.TTS_API_KEY?.trim()),
      defaultTtsEndpoint: DEFAULT_TTS_ENDPOINT,
      defaultCustomBaseUrl: process.env.CUSTOM_CHAT_BASE_URL?.trim() || '',
      defaultCustomModel: process.env.CUSTOM_CHAT_MODEL?.trim() || '',
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body || {}) as ChatRequestBody;
    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (m) =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim().length > 0
        )
      : [];

    const systemInstruction = buildSystemInstruction(body);
    const provider = body.provider === 'custom' ? 'custom' : 'gemini';
    const continueMode = Boolean(body.continueMode);

    if (provider === 'custom') {
      await handleCustomChat(res, body, systemInstruction, messages, continueMode);
    } else {
      await handleGeminiChat(
        res,
        body.model || 'gemini-4-hydrogen',
        systemInstruction,
        messages,
        continueMode
      );
    }
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      endpointUrl?: string;
      text?: string;
      voice?: string;
      model?: string;
      speed?: number;
      stability?: number;
      similarityBoost?: number;
      responseFormat?: string;
      payloadMode?: 'auto' | 'openai' | 'elevenlabs';
    };

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }
    if (text.length > 5000) {
      res.status(400).json({ error: 'Text exceeds 5000 character limit.' });
      return;
    }

    const rawEndpoint = body.endpointUrl?.trim() || DEFAULT_TTS_ENDPOINT;
    let validatedUrl: URL;
    try {
      validatedUrl = await validateExternalUrl(rawEndpoint);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid TTS endpoint URL.',
      });
      return;
    }

    const voice = (body.voice || 'Rachel').trim();
    const model = (body.model || 'eleven_multilingual_v2').trim();
    const speed =
      typeof body.speed === 'number' ? Math.min(2, Math.max(0.5, body.speed)) : 1.0;
    const stability =
      typeof body.stability === 'number' ? Math.min(1, Math.max(0, body.stability)) : 0.55;
    const similarityBoost =
      typeof body.similarityBoost === 'number'
        ? Math.min(1, Math.max(0, body.similarityBoost))
        : 0.78;
    const responseFormat = body.responseFormat || 'mp3';
    const payloadMode = body.payloadMode || 'auto';
    const ttsApiKey = process.env.TTS_API_KEY?.trim() || '';

    const openAiPayload = {
      model,
      input: text,
      voice,
      response_format: responseFormat,
      speed,
    };

    const elevenLabsPayload = {
      text,
      model_id: model,
      voice,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    };

    const startMs = Date.now();
    try {
      const initialPayload =
        payloadMode === 'elevenlabs' ? elevenLabsPayload : openAiPayload;
      let upstream = await postTtsPayload(
        validatedUrl.toString(),
        initialPayload,
        ttsApiKey
      );

      if (
        payloadMode === 'auto' &&
        (upstream.status === 400 || upstream.status === 422)
      ) {
        const retryCandidate = await postTtsPayload(
          validatedUrl.toString(),
          elevenLabsPayload,
          ttsApiKey
        );
        if (retryCandidate.ok || retryCandidate.status < 400) {
          upstream = retryCandidate;
        }
      }

      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get('location') || '';
        res.status(502).json({
          code: 'UPSTREAM_AUTH_REDIRECT',
          location,
          error:
            'The TTS endpoint returned a browser auth redirect (cookie check) instead of audio. Switch Request Mode to "Direct Browser Fetch" if you are logged into that preview, or deploy the TTS service publicly on Render.',
        });
        return;
      }

      const contentType = upstream.headers.get('content-type') || '';
      if (!upstream.ok) {
        const errText = await upstream.text();
        res.status(upstream.status).json({
          error: `TTS endpoint returned ${upstream.status}: ${errText.slice(0, 350)}`,
        });
        return;
      }

      if (contentType.includes('text/html')) {
        res.status(502).json({
          code: 'UPSTREAM_HTML_RESPONSE',
          error:
            'The TTS endpoint returned an HTML page instead of audio. Verify the endpoint URL path (/v1/audio/speech) or switch Request Mode to Direct Browser Fetch.',
        });
        return;
      }

      const audioBuffer = Buffer.from(await upstream.arrayBuffer());
      const latencyMs = Date.now() - startMs;
      res.setHeader(
        'Content-Type',
        contentType && contentType.includes('audio') ? contentType : 'audio/mpeg'
      );
      res.setHeader('X-TTS-Latency-Ms', String(latencyMs));
      res.send(audioBuffer);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error ? err.message : 'Failed to connect to TTS endpoint.',
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.resolve(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SillyTavern Voice server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
