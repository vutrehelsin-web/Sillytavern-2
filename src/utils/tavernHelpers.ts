import type {
  CharacterCard,
  TtsConfig,
  TtsTextFilter,
} from '../types/tavern';

export function applyTavernMacros(
  text: string,
  charName: string,
  userName: string
): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName);
}

export interface TextSegment {
  type: 'action' | 'dialogue' | 'plain';
  text: string;
}

export function parseRoleplaySegments(raw: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*[^*\n]+\*|"[^"\n]+")/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(raw);

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'plain',
        text: raw.slice(lastIndex, match.index),
      });
    }
    const token = match[0];
    if (token.startsWith('*') && token.endsWith('*')) {
      segments.push({ type: 'action', text: token.slice(1, -1) });
    } else if (token.startsWith('"') && token.endsWith('"')) {
      segments.push({ type: 'dialogue', text: token });
    } else {
      segments.push({ type: 'plain', text: token });
    }
    lastIndex = regex.lastIndex;
    match = regex.exec(raw);
  }

  if (lastIndex < raw.length) {
    segments.push({ type: 'plain', text: raw.slice(lastIndex) });
  }

  return segments;
}

export function extractTextForSpeech(
  rawText: string,
  filter: TtsTextFilter
): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  if (filter === 'dialogue_only') {
    const quotes = Array.from(trimmed.matchAll(/"([^"]+)"/g))
      .map((m) => m[1].trim())
      .filter(Boolean);
    if (quotes.length > 0) {
      return quotes.join(' ');
    }
    // Fall back to stripping asterisks if no quotes were used
    return trimmed.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim();
  }

  if (filter === 'strip_asterisks') {
    const cleaned = trimmed
      .replace(/\*[^*\n]+\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || trimmed.replace(/\*/g, '').trim();
  }

  return trimmed.replace(/\*/g, '');
}

export interface TtsSynthesisResult {
  blobUrl: string;
  mimeType: string;
  latencyMs: number;
  bytes: number;
}

export async function synthesizeSpeechAudio(params: {
  text: string;
  character: CharacterCard;
  ttsConfig: TtsConfig;
}): Promise<TtsSynthesisResult> {
  const { text, character, ttsConfig } = params;
  const spokenText = extractTextForSpeech(text, ttsConfig.textFilter);
  if (!spokenText) {
    throw new Error('No speakable text found in this message.');
  }

  const voice = character.voiceId.trim() || ttsConfig.defaultVoiceId.trim() || 'Rachel';
  const model =
    character.voiceModel.trim() ||
    ttsConfig.defaultModelId.trim() ||
    'eleven_multilingual_v2';
  const startedAt = performance.now();

  if (ttsConfig.requestMode === 'direct') {
    const endpoint = ttsConfig.endpointUrl.trim();
    const isElevenLabsNative = ttsConfig.payloadMode === 'elevenlabs';
    const body = isElevenLabsNative
      ? {
          text: spokenText,
          model_id: model,
          voice,
          voice_settings: {
            stability: character.voiceStability,
            similarity_boost: character.voiceSimilarity,
          },
        }
      : {
          model,
          input: spokenText,
          voice,
          response_format: ttsConfig.responseFormat,
          speed: character.voiceSpeed,
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, audio/wav, audio/*',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Direct TTS failed (${res.status}): ${errText.slice(0, 220)}`);
    }

    const contentType = res.headers.get('content-type') || 'audio/mpeg';
    if (contentType.includes('text/html')) {
      throw new Error(
        'Direct TTS returned an HTML page instead of audio. Verify endpoint access or use Server Proxy mode on Render.'
      );
    }

    const blob = await res.blob();
    return {
      blobUrl: URL.createObjectURL(blob),
      mimeType: contentType,
      latencyMs: Math.round(performance.now() - startedAt),
      bytes: blob.size,
    };
  }

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpointUrl: ttsConfig.endpointUrl,
      text: spokenText,
      voice,
      model,
      speed: character.voiceSpeed,
      stability: character.voiceStability,
      similarityBoost: character.voiceSimilarity,
      responseFormat: ttsConfig.responseFormat,
      payloadMode: ttsConfig.payloadMode,
    }),
  });

  if (!res.ok) {
    let message = `TTS proxy returned ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: string };
      if (errJson.error) message = errJson.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const headerLatency = Number(res.headers.get('x-tts-latency-ms'));
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType: blob.type || 'audio/mpeg',
    latencyMs: Number.isFinite(headerLatency) && headerLatency > 0
      ? headerLatency
      : Math.round(performance.now() - startedAt),
    bytes: blob.size,
  };
}

export function parseCharacterCardJson(rawJson: string): CharacterCard {
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  const data =
    parsed.data && typeof parsed.data === 'object'
      ? (parsed.data as Record<string, unknown>)
      : parsed;

  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported Character';
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;

  return {
    id,
    name,
    tagline:
      typeof data.creator_notes === 'string' && data.creator_notes.trim()
        ? data.creator_notes.trim().slice(0, 72)
        : typeof data.tagline === 'string' && data.tagline.trim()
          ? data.tagline.trim()
          : 'Imported Character Card',
    avatar: typeof data.avatar === 'string' && data.avatar.trim() ? data.avatar.trim() : '',
    description: typeof data.description === 'string' ? data.description : '',
    personality: typeof data.personality === 'string' ? data.personality : '',
    scenario: typeof data.scenario === 'string' ? data.scenario : '',
    firstMessage:
      typeof data.first_mes === 'string'
        ? data.first_mes
        : typeof data.firstMessage === 'string'
          ? data.firstMessage
          : `*${name} looks up as you enter.* "Good timing, {{user}}."`,
    exampleDialogue:
      typeof data.mes_example === 'string'
        ? data.mes_example
        : typeof data.exampleDialogue === 'string'
          ? data.exampleDialogue
          : '',
    systemPrompt:
      typeof data.system_prompt === 'string'
        ? data.system_prompt
        : typeof data.systemPrompt === 'string'
          ? data.systemPrompt
          : '',
    voiceId: typeof data.voiceId === 'string' && data.voiceId.trim() ? data.voiceId.trim() : 'Rachel',
    voiceModel:
      typeof data.voiceModel === 'string' && data.voiceModel.trim()
        ? data.voiceModel.trim()
        : 'eleven_multilingual_v2',
    voiceSpeed: typeof data.voiceSpeed === 'number' ? data.voiceSpeed : 1.0,
    voiceStability: typeof data.voiceStability === 'number' ? data.voiceStability : 0.55,
    voiceSimilarity: typeof data.voiceSimilarity === 'number' ? data.voiceSimilarity : 0.78,
  };
}

export function exportCharacterCardV2(character: CharacterCard): string {
  return JSON.stringify(
    {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: character.name,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        first_mes: character.firstMessage,
        mes_example: character.exampleDialogue,
        system_prompt: character.systemPrompt,
        creator_notes: character.tagline,
        extensions: {
          elevenlabs_voice: {
            voiceId: character.voiceId,
            voiceModel: character.voiceModel,
            voiceSpeed: character.voiceSpeed,
            voiceStability: character.voiceStability,
            voiceSimilarity: character.voiceSimilarity,
          },
        },
      },
    },
    null,
    2
  );
}
