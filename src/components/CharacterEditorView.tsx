import { useRef, useState } from 'react';
import { Download, Plus, Trash2, Upload, UserCheck, Volume2 } from 'lucide-react';
import type { CharacterCard, UserPersona } from '../types/tavern';
import { PRESET_VOICES } from '../data/presets';
import { Avatar } from './Avatar';
import {
  exportCharacterCardV2,
  parseCharacterCardJson,
} from '../utils/tavernHelpers';

interface CharacterEditorViewProps {
  character: CharacterCard;
  charactersCount: number;
  userPersona: UserPersona;
  onUpdateCharacter: (patch: Partial<CharacterCard>) => void;
  onCreateCharacter: () => void;
  onImportCharacter: (card: CharacterCard) => void;
  onDeleteCharacter: (id: string) => void;
  onUpdateUserPersona: (patch: Partial<UserPersona>) => void;
  onTestCharacterVoice: (character: CharacterCard) => void;
}

export function CharacterEditorView({
  character,
  charactersCount,
  userPersona,
  onUpdateCharacter,
  onCreateCharacter,
  onImportCharacter,
  onDeleteCharacter,
  onUpdateUserPersona,
  onTestCharacterVoice,
}: CharacterEditorViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = () => {
    const json = exportCharacterCardV2(character);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_card_v2.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const card = parseCharacterCardJson(text);
      onImportCharacter(card);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Could not parse SillyTavern Character Card JSON.'
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 bg-[#0d1117]">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">
              Character Card & Persona
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Supports SillyTavern V2 JSON cards, macros ({'{{char}}'}, {'{{user}}'}),
              and per-character ElevenLabs voice routing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                void handleImportFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 whitespace-nowrap cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export V2</span>
            </button>
            <button
              type="button"
              onClick={onCreateCharacter}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Character</span>
            </button>
          </div>
        </div>

        {importError && (
          <div className="rounded-lg border border-red-800/70 bg-red-950/40 px-4 py-3 text-xs text-red-200">
            {importError}
          </div>
        )}

        {/* Active Character Card */}
        <section className="rounded-xl border border-slate-800 bg-[#131922] p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-800">
            <div className="flex items-center gap-4">
              <Avatar src={character.avatar} name={character.name} size="xl" />
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-100">
                  {character.name}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {character.tagline || 'Character Card'}
                </p>
              </div>
            </div>

            {charactersCount > 1 && (
              <button
                type="button"
                onClick={() => onDeleteCharacter(character.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-800/60 text-red-300 hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Card</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Character Name
              </label>
              <input
                type="text"
                value={character.name}
                onChange={(e) => onUpdateCharacter({ name: e.target.value })}
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Short Tagline
              </label>
              <input
                type="text"
                value={character.tagline}
                onChange={(e) => onUpdateCharacter({ tagline: e.target.value })}
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Portrait URL (relative /src/assets/... or HTTPS image URL)
            </label>
            <input
              type="text"
              value={character.avatar}
              onChange={(e) => onUpdateCharacter({ avatar: e.target.value })}
              placeholder="https://... or leave empty for monogram avatar"
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Description
              </label>
              <textarea
                value={character.description}
                onChange={(e) =>
                  onUpdateCharacter({ description: e.target.value })
                }
                rows={4}
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Personality
              </label>
              <textarea
                value={character.personality}
                onChange={(e) =>
                  onUpdateCharacter({ personality: e.target.value })
                }
                rows={4}
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Scenario
            </label>
            <textarea
              value={character.scenario}
              onChange={(e) => onUpdateCharacter({ scenario: e.target.value })}
              rows={2}
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              First Message (Greeting)
            </label>
            <textarea
              value={character.firstMessage}
              onChange={(e) =>
                onUpdateCharacter({ firstMessage: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Example Dialogue
              </label>
              <textarea
                value={character.exampleDialogue}
                onChange={(e) =>
                  onUpdateCharacter({ exampleDialogue: e.target.value })
                }
                rows={3}
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Character System Prompt Override (Optional)
              </label>
              <textarea
                value={character.systemPrompt}
                onChange={(e) =>
                  onUpdateCharacter({ systemPrompt: e.target.value })
                }
                rows={3}
                placeholder="Additional instructions specific to this character..."
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Assigned ElevenLabs Voice */}
          <div className="pt-5 border-t border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Character ElevenLabs Voice Profile
              </h3>
              <button
                type="button"
                onClick={() => onTestCharacterVoice(character)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Test Character Voice</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Voice ID or Name
                </label>
                <input
                  type="text"
                  list="elevenlabs-voice-presets"
                  value={character.voiceId}
                  onChange={(e) =>
                    onUpdateCharacter({ voiceId: e.target.value })
                  }
                  placeholder="Rachel or 21m00Tcm4TlvDq8ikWAM"
                  className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <datalist id="elevenlabs-voice-presets">
                  {PRESET_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Voice Model ID
                </label>
                <input
                  type="text"
                  value={character.voiceModel}
                  onChange={(e) =>
                    onUpdateCharacter({ voiceModel: e.target.value })
                  }
                  placeholder="eleven_multilingual_v2"
                  className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300">Speed</span>
                  <span className="font-mono-tabular text-slate-400">
                    {character.voiceSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.3}
                  step={0.02}
                  value={character.voiceSpeed}
                  onChange={(e) =>
                    onUpdateCharacter({ voiceSpeed: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300">Stability</span>
                  <span className="font-mono-tabular text-slate-400">
                    {character.voiceStability.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={character.voiceStability}
                  onChange={(e) =>
                    onUpdateCharacter({
                      voiceStability: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300">Similarity Boost</span>
                  <span className="font-mono-tabular text-slate-400">
                    {character.voiceSimilarity.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={character.voiceSimilarity}
                  onChange={(e) =>
                    onUpdateCharacter({
                      voiceSimilarity: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* User Persona Section */}
        <section className="rounded-xl border border-slate-800 bg-[#131922] p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <span>Your Persona ({'{{user}}'})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={userPersona.name}
                onChange={(e) =>
                  onUpdateUserPersona({ name: e.target.value })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Persona Avatar URL
              </label>
              <input
                type="text"
                value={userPersona.avatar}
                onChange={(e) =>
                  onUpdateUserPersona({ avatar: e.target.value })
                }
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm font-mono-tabular text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Persona Description (shared with characters)
            </label>
            <textarea
              value={userPersona.description}
              onChange={(e) =>
                onUpdateUserPersona({ description: e.target.value })
              }
              rows={2}
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
