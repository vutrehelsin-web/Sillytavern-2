import { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  RotateCcw,
  Server,
  Volume2,
} from 'lucide-react';
import type {
  CharacterCard,
  ChatModelConfig,
  ServerConfigInfo,
  TtsConfig,
} from '../types/tavern';
import { DEFAULT_TTS_ENDPOINT, PRESET_VOICES } from '../data/presets';
import { synthesizeSpeechAudio } from '../utils/tavernHelpers';

interface SettingsViewProps {
  ttsConfig: TtsConfig;
  chatConfig: ChatModelConfig;
  serverInfo: ServerConfigInfo | null;
  activeCharacter: CharacterCard;
  onChangeTtsConfig: (patch: Partial<TtsConfig>) => void;
  onChangeChatConfig: (patch: Partial<ChatModelConfig>) => void;
}

export function SettingsView({
  ttsConfig,
  chatConfig,
  serverInfo,
  activeCharacter,
  onChangeTtsConfig,
  onChangeChatConfig,
}: SettingsViewProps) {
  const [testPhrase, setTestPhrase] = useState(
    'La lluvia cae sobre los adoquines mientras la cinta magnética empieza a girar.'
  );
  const [testingTts, setTestingTts] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    audioUrl?: string;
  } | null>(null);

  const handleRunTtsTest = async () => {
    if (!testPhrase.trim()) return;
    setTestingTts(true);
    setTestResult(null);
    try {
      const result = await synthesizeSpeechAudio({
        text: testPhrase,
        character: activeCharacter,
        ttsConfig,
      });
      setTestResult({
        ok: true,
        message: `Synthesized ${(result.bytes / 1024).toFixed(1)} KB (${result.mimeType}) in ${result.latencyMs} ms`,
        audioUrl: result.blobUrl,
      });
      const audio = new Audio(result.blobUrl);
      void audio.play().catch(() => {
        // User can also click the inline audio controls
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message:
          err instanceof Error ? err.message : 'TTS endpoint test failed.',
      });
    } finally {
      setTestingTts(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 bg-[#0d1117]">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Voice Endpoint, Chat Model & Render Setup
          </h1>
          <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">
            Configure your ElevenLabs-compatible speech endpoint, switch between
            the built-in Gemini chat model or any arbitrary OpenAI-compatible
            endpoint, and prepare environment variables for Render.
          </p>
        </div>

        {/* ElevenLabs TTS Endpoint Configuration */}
        <section className="rounded-xl border border-slate-800 bg-[#131922] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>ElevenLabs TTS Endpoint</span>
            </div>

            <button
              type="button"
              onClick={() =>
                onChangeTtsConfig({
                  endpointUrl:
                    serverInfo?.defaultTtsEndpoint || DEFAULT_TTS_ENDPOINT,
                })
              }
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Default URL</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Speech Endpoint URL (/v1/audio/speech)
            </label>
            <input
              type="url"
              value={ttsConfig.endpointUrl}
              onChange={(e) =>
                onChangeTtsConfig({ endpointUrl: e.target.value })
              }
              placeholder={DEFAULT_TTS_ENDPOINT}
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3.5 py-2.5 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Request Mode
              </label>
              <select
                value={ttsConfig.requestMode}
                onChange={(e) =>
                  onChangeTtsConfig({
                    requestMode: e.target.value as 'proxy' | 'direct',
                  })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="proxy">Server Proxy (/api/tts · Render)</option>
                <option value="direct">Direct Browser Fetch (CORS / Cookies)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Payload Format
              </label>
              <select
                value={ttsConfig.payloadMode}
                onChange={(e) =>
                  onChangeTtsConfig({
                    payloadMode: e.target.value as
                      | 'auto'
                      | 'openai'
                      | 'elevenlabs',
                  })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="auto">Auto (/v1/audio/speech + fallback)</option>
                <option value="openai">OpenAI Compatible (input, voice, model)</option>
                <option value="elevenlabs">ElevenLabs Native (text, model_id)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Spoken Text Filter
              </label>
              <select
                value={ttsConfig.textFilter}
                onChange={(e) =>
                  onChangeTtsConfig({
                    textFilter: e.target.value as
                      | 'all'
                      | 'dialogue_only'
                      | 'strip_asterisks',
                  })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="strip_asterisks">Strip *actions* (speak narration + quotes)</option>
                <option value="dialogue_only">Dialogue inside &quot;quotes&quot; only</option>
                <option value="all">Speak full message text</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Fallback Voice ID
              </label>
              <input
                type="text"
                list="settings-voice-presets"
                value={ttsConfig.defaultVoiceId}
                onChange={(e) =>
                  onChangeTtsConfig({ defaultVoiceId: e.target.value })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <datalist id="settings-voice-presets">
                {PRESET_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Fallback TTS Model
              </label>
              <input
                type="text"
                value={ttsConfig.defaultModelId}
                onChange={(e) =>
                  onChangeTtsConfig({ defaultModelId: e.target.value })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Audio Format
              </label>
              <select
                value={ttsConfig.responseFormat}
                onChange={(e) =>
                  onChangeTtsConfig({
                    responseFormat: e.target.value as 'mp3' | 'wav' | 'opus',
                  })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="mp3">mp3</option>
                <option value="wav">wav</option>
                <option value="opus">opus</option>
              </select>
            </div>
          </div>

          {/* Live Endpoint Test */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Test Endpoint with {activeCharacter.name} ({activeCharacter.voiceId})
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={testPhrase}
                onChange={(e) => setTestPhrase(e.target.value)}
                className="flex-1 rounded-lg bg-[#0d1117] border border-slate-700/80 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => void handleRunTtsTest()}
                disabled={testingTts || !testPhrase.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {testingTts ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{testingTts ? 'Testing...' : 'Test Endpoint'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`rounded-lg border px-4 py-3 text-xs space-y-2 ${
                  testResult.ok
                    ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200'
                    : 'border-red-800/70 bg-red-950/40 text-red-200'
                }`}
              >
                <p className="font-mono-tabular">{testResult.message}</p>
                {testResult.audioUrl && (
                  <audio
                    controls
                    src={testResult.audioUrl}
                    className="w-full h-9"
                  />
                )}
              </div>
            )}
          </div>
        </section>

        {/* Arbitrary Chat Model Configuration */}
        <section className="rounded-xl border border-slate-800 bg-[#131922] p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>Chat Model Provider</span>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-[#0d1117] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => onChangeChatConfig({ provider: 'gemini' })}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chatConfig.provider === 'gemini'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              Built-in Model (Gemini)
            </button>
            <button
              type="button"
              onClick={() => onChangeChatConfig({ provider: 'custom' })}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                chatConfig.provider === 'custom'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              Arbitrary OpenAI-Compatible Endpoint
            </button>
          </div>

          {chatConfig.provider === 'gemini' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Model
                </label>
                <select
                  value={chatConfig.geminiModel}
                  onChange={(e) =>
                    onChangeChatConfig({
                      geminiModel: e.target.value as
                        | 'gemini-4-hydrogen'
                        | 'gemini-3.1-flash-lite',
                    })
                  }
                  className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen (Default)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Lite)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Context Window Depth (messages)
                </label>
                <input
                  type="number"
                  min={4}
                  max={60}
                  value={chatConfig.contextDepth}
                  onChange={(e) =>
                    onChangeChatConfig({
                      contextDepth: Math.min(60, Math.max(4, Number(e.target.value) || 20)),
                    })
                  }
                  className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    OpenAI-Compatible Base URL
                  </label>
                  <input
                    type="url"
                    value={chatConfig.customBaseUrl}
                    onChange={(e) =>
                      onChangeChatConfig({ customBaseUrl: e.target.value })
                    }
                    placeholder={
                      serverInfo?.defaultCustomBaseUrl ||
                      'https://openrouter.ai/api/v1'
                    }
                    className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Arbitrary Model Name
                  </label>
                  <input
                    type="text"
                    value={chatConfig.customModel}
                    onChange={(e) =>
                      onChangeChatConfig({ customModel: e.target.value })
                    }
                    placeholder={
                      serverInfo?.defaultCustomModel ||
                      'meta-llama/llama-3.3-70b-instruct'
                    }
                    className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Temperature
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.05}
                    value={chatConfig.temperature}
                    onChange={(e) =>
                      onChangeChatConfig({
                        temperature: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    min={64}
                    max={4096}
                    step={32}
                    value={chatConfig.maxTokens}
                    onChange={(e) =>
                      onChangeChatConfig({
                        maxTokens: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Context Depth
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={chatConfig.contextDepth}
                    onChange={(e) =>
                      onChangeChatConfig({
                        contextDepth: Math.min(60, Math.max(4, Number(e.target.value) || 20)),
                      })
                    }
                    className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Authentication credentials for custom endpoints are read from server
                environment variables (<span className="font-mono-tabular text-slate-300">CUSTOM_CHAT_API_KEY</span> and{' '}
                <span className="font-mono-tabular text-slate-300">TTS_API_KEY</span>) in Render.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Global Roleplay System Prompt
            </label>
            <textarea
              value={chatConfig.globalSystemPrompt}
              onChange={(e) =>
                onChangeChatConfig({ globalSystemPrompt: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </section>

        {/* Render Deployment Blueprint Info */}
        <section className="rounded-xl border border-slate-800 bg-[#131922] p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Server className="w-4 h-4 text-amber-400" />
            <span>Render Deployment Configuration (render.yaml included)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-4 space-y-1.5">
              <div className="font-semibold text-slate-200">Build & Start Commands</div>
              <p className="font-mono-tabular text-slate-400">
                Build: <span className="text-slate-200">npm install && npm run build</span>
              </p>
              <p className="font-mono-tabular text-slate-400">
                Start: <span className="text-slate-200">node server.ts</span>
              </p>
              <p className="font-mono-tabular text-slate-400">
                Health Check: <span className="text-slate-200">/api/health</span>
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-4 space-y-1.5">
              <div className="font-semibold text-slate-200">Server Environment Variables</div>
              <div className="flex items-center gap-2 text-slate-300 font-mono-tabular">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    serverInfo?.hasGeminiKey ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                />
                <span>GEMINI_API_KEY</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300 font-mono-tabular">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>TTS_ENDPOINT_URL</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300 font-mono-tabular">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    serverInfo?.hasCustomChatKey ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                />
                <span>CUSTOM_CHAT_BASE_URL · CUSTOM_CHAT_MODEL</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
