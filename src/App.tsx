import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Plus, Search, X } from 'lucide-react';
import type {
  CharacterCard,
  ChatMessage,
  ChatModelConfig,
  ChatSession,
  LorebookEntry,
  ServerConfigInfo,
  TtsConfig,
  UserPersona,
} from './types/tavern';
import {
  DEFAULT_CHAT_CONFIG,
  DEFAULT_LOREBOOK,
  DEFAULT_TTS_CONFIG,
  DEFAULT_USER_PERSONA,
  PRESET_CHARACTERS,
} from './data/presets';
import { Avatar } from './components/Avatar';
import { ChatView } from './components/ChatView';
import { CharacterEditorView } from './components/CharacterEditorView';
import { LorebookView } from './components/LorebookView';
import { SettingsView } from './components/SettingsView';
import {
  applyTavernMacros,
  synthesizeSpeechAudio,
  type TtsSynthesisResult,
} from './utils/tavernHelpers';

type ActiveTab = 'chat' | 'characters' | 'lorebook' | 'settings';

const STORAGE_KEYS = {
  characters: 'stv_characters_v1',
  activeCharId: 'stv_active_char_v1',
  sessions: 'stv_sessions_v1',
  lorebook: 'stv_lorebook_v1',
  userPersona: 'stv_persona_v1',
  ttsConfig: 'stv_tts_config_v1',
  chatConfig: 'stv_chat_config_v1',
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildInitialGreeting(
  char: CharacterCard,
  userName: string
): ChatMessage {
  return {
    id: `msg-greet-${Date.now().toString(36)}`,
    role: 'assistant',
    swipes: [applyTavernMacros(char.firstMessage, char.name, userName)],
    swipeIndex: 0,
    timestamp: Date.now(),
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [charSearch, setCharSearch] = useState('');

  const [characters, setCharacters] = useState<CharacterCard[]>(() =>
    readStored(STORAGE_KEYS.characters, PRESET_CHARACTERS)
  );
  const [activeCharId, setActiveCharId] = useState<string>(() =>
    readStored(STORAGE_KEYS.activeCharId, PRESET_CHARACTERS[0].id)
  );
  const [userPersona, setUserPersona] = useState<UserPersona>(() =>
    readStored(STORAGE_KEYS.userPersona, DEFAULT_USER_PERSONA)
  );
  const [lorebook, setLorebook] = useState<LorebookEntry[]>(() =>
    readStored(STORAGE_KEYS.lorebook, DEFAULT_LOREBOOK)
  );
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>(() =>
    readStored(STORAGE_KEYS.ttsConfig, DEFAULT_TTS_CONFIG)
  );
  const [chatConfig, setChatConfig] = useState<ChatModelConfig>(() =>
    readStored(STORAGE_KEYS.chatConfig, DEFAULT_CHAT_CONFIG)
  );
  const [sessions, setSessions] = useState<Record<string, ChatSession>>(() =>
    readStored(STORAGE_KEYS.sessions, {})
  );
  const [serverInfo, setServerInfo] = useState<ServerConfigInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Audio playback state
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [cachedAudio, setCachedAudio] = useState<
    Record<string, TtsSynthesisResult>
  >({});

  const activeCharacter = useMemo(
    () =>
      characters.find((c) => c.id === activeCharId) ??
      characters[0] ??
      PRESET_CHARACTERS[0],
    [characters, activeCharId]
  );

  // Persist workspace state locally
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.characters, JSON.stringify(characters));
  }, [characters]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeCharId, JSON.stringify(activeCharId));
  }, [activeCharId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.userPersona, JSON.stringify(userPersona));
  }, [userPersona]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.lorebook, JSON.stringify(lorebook));
  }, [lorebook]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ttsConfig, JSON.stringify(ttsConfig));
  }, [ttsConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.chatConfig, JSON.stringify(chatConfig));
  }, [chatConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  }, [sessions]);

  // Fetch non-secret server configuration on mount
  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerConfigInfo | null) => {
        if (!data) return;
        setServerInfo(data);
        setTtsConfig((prev) => ({
          ...prev,
          endpointUrl: prev.endpointUrl || data.defaultTtsEndpoint,
        }));
        setChatConfig((prev) => ({
          ...prev,
          customBaseUrl: prev.customBaseUrl || data.defaultCustomBaseUrl,
          customModel: prev.customModel || data.defaultCustomModel,
        }));
      })
      .catch(() => {
        // Ignore startup check errors
      });
  }, []);

  // Ensure active character always has an initialized session with its greeting
  useEffect(() => {
    if (!sessions[activeCharacter.id]) {
      setSessions((prev) => ({
        ...prev,
        [activeCharacter.id]: {
          characterId: activeCharacter.id,
          messages: [buildInitialGreeting(activeCharacter, userPersona.name)],
          updatedAt: Date.now(),
        },
      }));
    }
  }, [activeCharacter, sessions, userPersona.name]);

  // Attach HTMLAudioElement listeners once
  useEffect(() => {
    const audio = new Audio();
    audioElRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, []);

  const currentMessages = sessions[activeCharacter.id]?.messages ?? [];

  const playAudioBlob = async (cacheKey: string, blobUrl: string) => {
    const audio = audioElRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = blobUrl;
    audio.currentTime = 0;
    setActiveMessageId(cacheKey);
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  };

  const handlePlayMessageAudio = async (
    cacheKey: string,
    text: string,
    charOverride?: CharacterCard
  ) => {
    setAudioError(null);
    const existing = cachedAudio[cacheKey];
    if (existing) {
      await playAudioBlob(cacheKey, existing.blobUrl);
      return;
    }

    setLoadingMessageId(cacheKey);
    try {
      const result = await synthesizeSpeechAudio({
        text,
        character: charOverride ?? activeCharacter,
        ttsConfig,
      });
      setCachedAudio((prev) => ({ ...prev, [cacheKey]: result }));
      await playAudioBlob(cacheKey, result.blobUrl);
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : 'Speech synthesis failed.'
      );
    } finally {
      setLoadingMessageId(null);
    }
  };

  const handleTogglePauseAudio = () => {
    const audio = audioElRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const handleStopAudio = () => {
    const audio = audioElRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setActiveMessageId(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const handleSeekAudio = (time: number) => {
    const audio = audioElRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const updateSessionMessages = (
    charId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[]
  ) => {
    setSessions((prev) => {
      const current = prev[charId]?.messages ?? [];
      return {
        ...prev,
        [charId]: {
          characterId: charId,
          messages: updater(current),
          updatedAt: Date.now(),
        },
      };
    });
  };

  const runCompletionStream = async (params: {
    char: CharacterCard;
    historyForPrompt: ChatMessage[];
    targetMsgId: string;
    swipeIndex: number;
    continueMode?: boolean;
  }) => {
    const { char, historyForPrompt, targetMsgId, swipeIndex, continueMode } = params;
    setIsGenerating(true);
    setChatError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const contextWindow = historyForPrompt
      .slice(-chatConfig.contextDepth)
      .map((m) => ({
        role: m.role,
        content: applyTavernMacros(
          m.swipes[m.swipeIndex] ?? '',
          char.name,
          userPersona.name
        ),
      }))
      .filter((m) => m.content.trim().length > 0);

    const modelName =
      chatConfig.provider === 'custom'
        ? chatConfig.customModel.trim() || 'custom-model'
        : chatConfig.geminiModel;

    let accumulated = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider: chatConfig.provider,
          model: modelName,
          customBaseUrl: chatConfig.customBaseUrl,
          temperature: chatConfig.temperature,
          maxTokens: chatConfig.maxTokens,
          globalSystemPrompt: chatConfig.globalSystemPrompt,
          continueMode: Boolean(continueMode),
          character: {
            name: char.name,
            description: char.description,
            personality: char.personality,
            scenario: char.scenario,
            exampleDialogue: char.exampleDialogue,
            systemPrompt: char.systemPrompt,
          },
          userPersona: {
            name: userPersona.name,
            description: userPersona.description,
          },
          worldInfo: lorebook,
          messages: contextWindow,
        }),
      });

      if (!response.ok) {
        let message = `Chat request failed (${response.status})`;
        try {
          const errData = (await response.json()) as { error?: string };
          if (errData.error) message = errData.error;
        } catch {
          // ignore parse failure
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error('Server returned an empty chat stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          const line = evt
            .split('\n')
            .find((l) => l.startsWith('data:'))
            ?.slice(5)
            .trim();
          if (!line) continue;

          try {
            const parsed = JSON.parse(line) as {
              token?: string;
              error?: string;
              done?: boolean;
            };
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.token) {
              accumulated += parsed.token;
              updateSessionMessages(char.id, (prev) =>
                prev.map((m) => {
                  if (m.id !== targetMsgId) return m;
                  const nextSwipes = [...m.swipes];
                  nextSwipes[swipeIndex] = accumulated;
                  return {
                    ...m,
                    swipes: nextSwipes,
                    swipeIndex,
                    modelUsed: modelName,
                  };
                })
              );
            }
          } catch (innerErr) {
            if (innerErr instanceof Error && !innerErr.message.includes('JSON')) {
              throw innerErr;
            }
          }
        }
      }

      if (ttsConfig.autoPlay && accumulated.trim()) {
        const cacheKey = `${targetMsgId}:${swipeIndex}`;
        void handlePlayMessageAudio(cacheKey, accumulated, char);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg =
          err instanceof Error ? err.message : 'Failed to generate response.';
        setChatError(msg);
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    const char = activeCharacter;
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now().toString(36)}`,
      role: 'user',
      swipes: [text],
      swipeIndex: 0,
      timestamp: Date.now(),
    };
    const assistantMsgId = `msg-a-${(Date.now() + 1).toString(36)}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      swipes: [''],
      swipeIndex: 0,
      timestamp: Date.now() + 1,
    };

    const nextHistory = [...currentMessages, userMsg];
    updateSessionMessages(char.id, () => [...nextHistory, assistantPlaceholder]);

    await runCompletionStream({
      char,
      historyForPrompt: nextHistory,
      targetMsgId: assistantMsgId,
      swipeIndex: 0,
    });
  };

  const handleContinue = async () => {
    const char = activeCharacter;
    const assistantMsgId = `msg-a-${Date.now().toString(36)}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      swipes: [''],
      swipeIndex: 0,
      timestamp: Date.now(),
    };
    const history = [...currentMessages];
    updateSessionMessages(char.id, () => [...history, assistantPlaceholder]);

    await runCompletionStream({
      char,
      historyForPrompt: history,
      targetMsgId: assistantMsgId,
      swipeIndex: 0,
      continueMode: true,
    });
  };

  const handleRegenerateMessage = async (messageId: string) => {
    const char = activeCharacter;
    const idx = currentMessages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const target = currentMessages[idx];
    const nextSwipeIndex = target.swipes.length;

    updateSessionMessages(char.id, (prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, swipes: [...m.swipes, ''], swipeIndex: nextSwipeIndex }
          : m
      )
    );

    const historyBefore = currentMessages.slice(0, idx);
    await runCompletionStream({
      char,
      historyForPrompt: historyBefore,
      targetMsgId: messageId,
      swipeIndex: nextSwipeIndex,
      continueMode: historyBefore.length === 0,
    });
  };

  const handleSwipeMessage = (messageId: string, direction: -1 | 1) => {
    updateSessionMessages(activeCharacter.id, (prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const nextIndex = Math.min(
          m.swipes.length - 1,
          Math.max(0, m.swipeIndex + direction)
        );
        return { ...m, swipeIndex: nextIndex };
      })
    );
  };

  const handleEditMessage = (messageId: string, nextText: string) => {
    updateSessionMessages(activeCharacter.id, (prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const nextSwipes = [...m.swipes];
        nextSwipes[m.swipeIndex] = nextText;
        return { ...m, swipes: nextSwipes };
      })
    );
  };

  const handleDeleteMessage = (messageId: string) => {
    updateSessionMessages(activeCharacter.id, (prev) =>
      prev.filter((m) => m.id !== messageId)
    );
  };

  const handleResetChat = () => {
    handleStopAudio();
    setChatError(null);
    setSessions((prev) => ({
      ...prev,
      [activeCharacter.id]: {
        characterId: activeCharacter.id,
        messages: [buildInitialGreeting(activeCharacter, userPersona.name)],
        updatedAt: Date.now(),
      },
    }));
  };

  const handleCreateCharacter = () => {
    const id = `char-${Date.now().toString(36)}`;
    const newChar: CharacterCard = {
      id,
      name: 'New Character',
      tagline: 'Custom Roleplay Companion',
      avatar: '',
      description: '{{char}} is an original character created in SillyTavern Voice.',
      personality: 'Thoughtful, expressive, grounded.',
      scenario: 'A quiet conversation with {{user}}.',
      firstMessage:
        '*{{char}} glances up as you arrive.* "Ready when you are, {{user}}."',
      exampleDialogue: '',
      systemPrompt: '',
      voiceId: ttsConfig.defaultVoiceId || 'Rachel',
      voiceModel: ttsConfig.defaultModelId || 'eleven_multilingual_v2',
      voiceSpeed: 1.0,
      voiceStability: 0.55,
      voiceSimilarity: 0.78,
    };
    setCharacters((prev) => [newChar, ...prev]);
    setActiveCharId(id);
    setActiveTab('characters');
  };

  const handleImportCharacter = (card: CharacterCard) => {
    setCharacters((prev) => [card, ...prev]);
    setActiveCharId(card.id);
  };

  const handleDeleteCharacter = (id: string) => {
    if (characters.length <= 1) return;
    const remaining = characters.filter((c) => c.id !== id);
    setCharacters(remaining);
    if (activeCharId === id) {
      setActiveCharId(remaining[0].id);
    }
  };

  const filteredCharacters = useMemo(() => {
    const q = charSearch.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.tagline.toLowerCase().includes(q)
    );
  }, [characters, charSearch]);

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'characters', label: 'Characters' },
    { id: 'lorebook', label: 'Lorebook' },
    { id: 'settings', label: 'Voice & Model' },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-slate-100 overflow-hidden">
      {/* 3-Zone Top Bar */}
      <header className="shrink-0 h-14 flex items-center justify-between gap-8 px-5 border-b border-slate-800/90 bg-[#11161f]">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="lg:hidden p-1.5 rounded-md text-slate-300 hover:bg-slate-800 cursor-pointer"
            aria-label="Toggle character sidebar"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            SillyTavern Voice
          </span>
        </div>

        <nav
          aria-label="Workspace views"
          className="flex items-center gap-6 overflow-x-auto"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'text-amber-400'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-400" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden sm:flex items-center shrink-0">
          <button
            type="button"
            onClick={handleCreateCharacter}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Character</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Character Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } fixed lg:static inset-y-14 left-0 z-30 w-[272px] shrink-0 bg-[#11161f] border-r border-slate-800/90 flex flex-col transition-transform duration-200`}
        >
          <div className="p-3.5 border-b border-slate-800/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={charSearch}
                onChange={(e) => setCharSearch(e.target.value)}
                placeholder="Filter characters..."
                className="w-full rounded-lg bg-[#0d1117] border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
            {filteredCharacters.map((char) => {
              const isSelected = char.id === activeCharacter.id;
              const msgCount = sessions[char.id]?.messages.length ?? 1;

              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => {
                    setActiveCharId(char.id);
                    setSidebarOpen(false);
                    if (activeTab !== 'characters') {
                      setActiveTab('chat');
                    }
                  }}
                  className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#1a2230] border-amber-500/40'
                      : 'bg-transparent border-transparent hover:bg-slate-800/40'
                  }`}
                >
                  <Avatar src={char.avatar} name={char.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {char.name}
                    </div>
                    <div className="text-xs text-slate-400 truncate flex items-center gap-1.5 font-mono-tabular">
                      <span className="truncate">{char.voiceId}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{msgCount} msgs</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3.5 border-t border-slate-800/80 flex items-center gap-3">
            <Avatar src={userPersona.avatar} name={userPersona.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-200 truncate">
                {userPersona.name}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Active Persona
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('characters');
                setSidebarOpen(false);
              }}
              className="text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Edit
            </button>
          </div>
        </aside>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-14 bg-black/60 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Active Viewport */}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {chatError && activeTab === 'chat' && (
            <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-2.5 bg-red-950/50 border-b border-red-800/60 text-xs text-red-200">
              <p className="min-w-0">
                <span className="font-semibold text-red-300">Chat Error: </span>
                {chatError}
              </p>
              <button
                type="button"
                onClick={() => setChatError(null)}
                className="px-2.5 py-1 rounded border border-red-700/70 text-red-200 hover:bg-red-900/40 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'chat' && (
            <ChatView
              character={activeCharacter}
              userPersona={userPersona}
              messages={currentMessages}
              chatConfig={chatConfig}
              ttsConfig={ttsConfig}
              isGenerating={isGenerating}
              onSendMessage={(text) => void handleSendMessage(text)}
              onContinue={() => void handleContinue()}
              onStopGeneration={() => abortControllerRef.current?.abort()}
              onRegenerateMessage={(id) => void handleRegenerateMessage(id)}
              onSwipeMessage={handleSwipeMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onResetChat={handleResetChat}
              onToggleAutoPlay={() =>
                setTtsConfig((prev) => ({ ...prev, autoPlay: !prev.autoPlay }))
              }
              audioState={{
                activeMessageId,
                loadingMessageId,
                isPlaying,
                currentTime,
                duration,
                error: audioError,
                cachedAudio,
              }}
              onPlayMessageAudio={(key, text) =>
                void handlePlayMessageAudio(key, text)
              }
              onTogglePauseAudio={handleTogglePauseAudio}
              onStopAudio={handleStopAudio}
              onSeekAudio={handleSeekAudio}
              onClearAudioError={() => setAudioError(null)}
            />
          )}

          {activeTab === 'characters' && (
            <CharacterEditorView
              character={activeCharacter}
              charactersCount={characters.length}
              userPersona={userPersona}
              onUpdateCharacter={(patch) =>
                setCharacters((prev) =>
                  prev.map((c) =>
                    c.id === activeCharacter.id ? { ...c, ...patch } : c
                  )
                )
              }
              onCreateCharacter={handleCreateCharacter}
              onImportCharacter={handleImportCharacter}
              onDeleteCharacter={handleDeleteCharacter}
              onUpdateUserPersona={(patch) =>
                setUserPersona((prev) => ({ ...prev, ...patch }))
              }
              onTestCharacterVoice={(char) => {
                setActiveTab('chat');
                void handlePlayMessageAudio(
                  `test-${char.id}-${Date.now()}`,
                  `Hello ${userPersona.name}, my voice is ${char.voiceId}.`,
                  char
                );
              }}
            />
          )}

          {activeTab === 'lorebook' && (
            <LorebookView
              entries={lorebook}
              onChangeEntries={setLorebook}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              ttsConfig={ttsConfig}
              chatConfig={chatConfig}
              serverInfo={serverInfo}
              activeCharacter={activeCharacter}
              onChangeTtsConfig={(patch) =>
                setTtsConfig((prev) => ({ ...prev, ...patch }))
              }
              onChangeChatConfig={(patch) =>
                setChatConfig((prev) => ({ ...prev, ...patch }))
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
