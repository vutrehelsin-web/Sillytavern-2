import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  CharacterCard,
  ChatMessage,
  ChatModelConfig,
  TtsConfig,
  UserPersona,
} from '../types/tavern';
import { Avatar } from './Avatar';
import {
  applyTavernMacros,
  parseRoleplaySegments,
  type TtsSynthesisResult,
} from '../utils/tavernHelpers';

interface ChatViewProps {
  character: CharacterCard;
  userPersona: UserPersona;
  messages: ChatMessage[];
  chatConfig: ChatModelConfig;
  ttsConfig: TtsConfig;
  isGenerating: boolean;
  onSendMessage: (text: string) => void;
  onContinue: () => void;
  onStopGeneration: () => void;
  onRegenerateMessage: (messageId: string) => void;
  onSwipeMessage: (messageId: string, direction: -1 | 1) => void;
  onEditMessage: (messageId: string, nextText: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onResetChat: () => void;
  onToggleAutoPlay: () => void;
  audioState: {
    activeMessageId: string | null;
    loadingMessageId: string | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    error: string | null;
    cachedAudio: Record<string, TtsSynthesisResult>;
  };
  onPlayMessageAudio: (messageId: string, text: string) => void;
  onTogglePauseAudio: () => void;
  onStopAudio: () => void;
  onSeekAudio: (time: number) => void;
  onClearAudioError: () => void;
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ChatView({
  character,
  userPersona,
  messages,
  chatConfig,
  ttsConfig,
  isGenerating,
  onSendMessage,
  onContinue,
  onStopGeneration,
  onRegenerateMessage,
  onSwipeMessage,
  onEditMessage,
  onDeleteMessage,
  onResetChat,
  onToggleAutoPlay,
  audioState,
  onPlayMessageAudio,
  onTogglePauseAudio,
  onStopAudio,
  onSeekAudio,
  onClearAudioError,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isGenerating]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const activeModelLabel =
    chatConfig.provider === 'custom'
      ? chatConfig.customModel.trim() || 'Custom Endpoint'
      : chatConfig.geminiModel;

  const activeAudioCache = audioState.activeMessageId
    ? audioState.cachedAudio[audioState.activeMessageId]
    : undefined;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d1117]">
      {/* Character Context Strip */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 border-b border-slate-800/80 bg-[#121821]">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar src={character.avatar} name={character.name} size="md" />
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold text-slate-100 truncate">
              {character.name}
            </h1>
            <p className="text-xs text-slate-400 truncate flex items-center gap-2">
              <span>{character.tagline}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-slate-300">
                Voice: {character.voiceId}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-slate-400">
                {activeModelLabel}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleAutoPlay}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              ttsConfig.autoPlay
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:text-slate-100 hover:border-slate-600'
            }`}
          >
            {ttsConfig.autoPlay ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>{ttsConfig.autoPlay ? 'Auto-Voice On' : 'Auto-Voice Off'}</span>
          </button>

          <button
            type="button"
            onClick={onResetChat}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-700/80 bg-slate-800/70 text-slate-300 hover:text-slate-100 hover:border-slate-600 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Chat</span>
          </button>
        </div>
      </div>

      {/* Audio / TTS error banner */}
      {audioState.error && (
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-2.5 bg-red-950/50 border-b border-red-800/60 text-xs text-red-200">
          <p className="min-w-0">
            <span className="font-semibold text-red-300">TTS Error: </span>
            {audioState.error}
          </p>
          <button
            type="button"
            onClick={onClearAudioError}
            className="px-2.5 py-1 rounded border border-red-700/70 text-red-200 hover:bg-red-900/40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="border border-slate-800 rounded-xl bg-[#141a24] p-8 text-center">
              <p className="text-sm text-slate-300 mb-4">
                No messages in this branch yet. Start speaking with {character.name}.
              </p>
              <button
                type="button"
                onClick={onResetChat}
                className="px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 transition-colors cursor-pointer"
              >
                Load Greeting
              </button>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isAssistant = msg.role === 'assistant';
            const rawText = msg.swipes[msg.swipeIndex] ?? '';
            const resolvedText = applyTavernMacros(
              rawText,
              character.name,
              userPersona.name
            );
            const cacheKey = `${msg.id}:${msg.swipeIndex}`;
            const isThisPlaying =
              audioState.activeMessageId === cacheKey && audioState.isPlaying;
            const isThisActive = audioState.activeMessageId === cacheKey;
            const isThisLoading = audioState.loadingMessageId === cacheKey;
            const hasCached = Boolean(audioState.cachedAudio[cacheKey]);
            const isLastMessage = idx === messages.length - 1;

            return (
              <article
                key={msg.id}
                className={`group rounded-xl border transition-colors p-5 ${
                  isAssistant
                    ? 'bg-[#131922] border-slate-800/90'
                    : 'bg-[#171f2b] border-slate-700/70'
                }`}
              >
                <div className="flex items-start gap-4">
                  <Avatar
                    src={isAssistant ? character.avatar : userPersona.avatar}
                    name={isAssistant ? character.name : userPersona.name}
                    size="md"
                  />

                  <div className="flex-1 min-w-0">
                    {/* Message Header */}
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-display text-sm font-semibold text-slate-100 truncate">
                          {isAssistant ? character.name : userPersona.name}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="font-mono-tabular text-xs text-slate-400">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isAssistant && msg.modelUsed && (
                          <>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="font-mono-tabular text-xs text-slate-400 truncate max-w-[180px]">
                              {msg.modelUsed}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Swipe Navigation for Assistant */}
                      {isAssistant && msg.swipes.length > 1 && (
                        <div className="flex items-center gap-1 font-mono-tabular text-xs text-slate-400 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSwipeMessage(msg.id, -1)}
                            disabled={msg.swipeIndex === 0 || isGenerating}
                            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                            aria-label="Previous response variant"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span>
                            {msg.swipeIndex + 1}/{msg.swipes.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => onSwipeMessage(msg.id, 1)}
                            disabled={
                              msg.swipeIndex >= msg.swipes.length - 1 || isGenerating
                            }
                            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                            aria-label="Next response variant"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Message Body or Inline Editor */}
                    {editingId === msg.id ? (
                      <div className="space-y-3">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={4}
                          className="w-full rounded-lg bg-[#0d1117] border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onEditMessage(msg.id, editDraft);
                              setEditingId(null);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-slate-950 rounded-md hover:bg-amber-400 cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[15px] leading-[1.7] text-slate-200 whitespace-pre-wrap break-words max-w-[68ch]">
                        {resolvedText ? (
                          parseRoleplaySegments(resolvedText).map((seg, segIdx) => {
                            if (seg.type === 'action') {
                              return (
                                <em
                                  key={segIdx}
                                  className="italic text-amber-200/80"
                                >
                                  *{seg.text}*
                                </em>
                              );
                            }
                            if (seg.type === 'dialogue') {
                              return (
                                <span
                                  key={segIdx}
                                  className="text-slate-50 font-medium"
                                >
                                  {seg.text}
                                </span>
                              );
                            }
                            return <span key={segIdx}>{seg.text}</span>;
                          })
                        ) : (
                          <span className="text-slate-500 italic">
                            Generating response...
                          </span>
                        )}
                      </div>
                    )}

                    {/* Message Action Bar */}
                    {editingId !== msg.id && resolvedText && (
                      <div className="mt-3.5 pt-2.5 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {isAssistant && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isThisActive) {
                                  onTogglePauseAudio();
                                } else {
                                  onPlayMessageAudio(cacheKey, resolvedText);
                                }
                              }}
                              disabled={isThisLoading}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isThisActive
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                  : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:text-slate-100 hover:border-slate-600'
                              }`}
                            >
                              {isThisLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isThisPlaying ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isThisLoading
                                  ? 'Synthesizing...'
                                  : isThisPlaying
                                    ? 'Pause Voice'
                                    : isThisActive
                                      ? 'Resume Voice'
                                      : hasCached
                                        ? 'Replay Voice'
                                        : 'Speak'}
                              </span>
                            </button>
                          )}

                          {isAssistant && audioState.cachedAudio[cacheKey] && (
                            <a
                              href={audioState.cachedAudio[cacheKey].blobUrl}
                              download={`${character.name.toLowerCase().replace(/\s+/g, '_')}_voice.${ttsConfig.responseFormat}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 rounded border border-transparent hover:border-slate-700/70 transition-colors"
                              title="Download synthesized audio"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="font-mono-tabular">
                                {audioState.cachedAudio[cacheKey].latencyMs}ms
                              </span>
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {isAssistant && isLastMessage && !isGenerating && (
                            <button
                              type="button"
                              onClick={() => onRegenerateMessage(msg.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800/80 transition-colors whitespace-nowrap cursor-pointer"
                              title="Generate another swipe variant"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Regenerate</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(msg.id);
                              setEditDraft(rawText);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800/80 transition-colors cursor-pointer"
                            aria-label="Edit message"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMessage(msg.id)}
                            disabled={isGenerating}
                            className="p-1.5 text-slate-400 hover:text-red-300 rounded hover:bg-slate-800/80 transition-colors disabled:opacity-40 cursor-pointer"
                            aria-label="Delete message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Active Audio Transport Bar */}
      {audioState.activeMessageId && (
        <div className="shrink-0 border-t border-slate-800 bg-[#121821] px-6 py-2.5">
          <div className="max-w-3xl mx-auto flex items-center gap-4">
            <button
              type="button"
              onClick={onTogglePauseAudio}
              className="w-8 h-8 rounded-md bg-amber-500 text-slate-950 flex items-center justify-center hover:bg-amber-400 transition-colors shrink-0 cursor-pointer"
              aria-label={audioState.isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {audioState.isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-200 font-medium truncate">
                  {character.name} · Voice {character.voiceId}
                </span>
                <span className="font-mono-tabular text-slate-400 shrink-0">
                  {formatSeconds(audioState.currentTime)} /{' '}
                  {formatSeconds(audioState.duration)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={audioState.duration || 1}
                step={0.1}
                value={audioState.currentTime}
                onChange={(e) => onSeekAudio(Number(e.target.value))}
                aria-label="Audio playback progress"
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {activeAudioCache && (
              <a
                href={activeAudioCache.blobUrl}
                download={`${character.name.toLowerCase().replace(/\s+/g, '_')}_audio.${ttsConfig.responseFormat}`}
                className="p-2 text-slate-300 hover:text-slate-100 rounded-md border border-slate-700/80 hover:border-slate-600 shrink-0"
                title="Download audio"
              >
                <Download className="w-4 h-4" />
              </a>
            )}

            <button
              type="button"
              onClick={onStopAudio}
              className="p-2 text-slate-400 hover:text-slate-100 rounded-md border border-slate-700/80 hover:border-slate-600 shrink-0 cursor-pointer"
              aria-label="Stop audio"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-slate-800/90 bg-[#11161f] px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 bg-[#0d1117] border border-slate-700/80 rounded-xl p-2.5 focus-within:border-amber-500/70 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={`Message ${character.name} as ${userPersona.name}... (use *actions* and "dialogue")`}
              rows={1}
              className="flex-1 bg-transparent resize-none px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none max-h-[180px]"
            />

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onContinue}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                title="Prompt character to continue the scene"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Continue</span>
              </button>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
