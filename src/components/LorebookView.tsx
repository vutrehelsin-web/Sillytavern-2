import { useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import type { LorebookEntry } from '../types/tavern';

interface LorebookViewProps {
  entries: LorebookEntry[];
  onChangeEntries: (next: LorebookEntry[]) => void;
}

export function LorebookView({ entries, onChangeEntries }: LorebookViewProps) {
  const [newKeys, setNewKeys] = useState('');
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');

  const handleAdd = () => {
    const name = newName.trim();
    const content = newContent.trim();
    const keys = newKeys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (!name || !content || keys.length === 0) return;

    const created: LorebookEntry = {
      id: `lore-${Date.now().toString(36)}`,
      name,
      keys,
      content,
      enabled: true,
    };
    onChangeEntries([created, ...entries]);
    setNewName('');
    setNewKeys('');
    setNewContent('');
  };

  const toggleEntry = (id: string) => {
    onChangeEntries(
      entries.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
    );
  };

  const updateEntry = (id: string, patch: Partial<LorebookEntry>) => {
    onChangeEntries(
      entries.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  };

  const deleteEntry = (id: string) => {
    onChangeEntries(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 bg-[#0d1117]">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            World Info & Lorebook
          </h1>
          <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">
            Keyword-triggered background lore injected automatically into the model
            prompt whenever any trigger key appears in recent conversation messages.
          </p>
        </div>

        {/* Create Entry Form */}
        <section className="rounded-xl border border-slate-800 bg-[#131922] p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>Add Lorebook Entry</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Entry Title
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Blackwood Harbor Customs"
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Trigger Keys (comma-separated)
              </label>
              <input
                type="text"
                value={newKeys}
                onChange={(e) => setNewKeys(e.target.value)}
                placeholder="harbor, ship, customs, dock"
                className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Injected Context (supports {'{{char}}'} and {'{{user}}'})
            </label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              placeholder="Write concise world lore injected when any key matches..."
              className="w-full rounded-lg bg-[#0d1117] border border-slate-700/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newName.trim() || !newKeys.trim() || !newContent.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entry</span>
            </button>
          </div>
        </section>

        {/* Entries List */}
        <section className="space-y-4">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-[#131922] p-8 text-center text-sm text-slate-400">
              No lorebook entries configured yet. Add an entry above to enrich your
              roleplay context.
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-800 bg-[#131922] p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={entry.name}
                      onChange={(e) =>
                        updateEntry(entry.id, { name: e.target.value })
                      }
                      className="w-full bg-transparent font-display text-base font-semibold text-slate-100 focus:outline-none focus:underline"
                    />
                    <p className="text-xs text-slate-400 mt-0.5 font-mono-tabular">
                      Keys: {entry.keys.join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleEntry(entry.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                        entry.enabled
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {entry.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry.id)}
                      className="p-2 text-slate-400 hover:text-red-300 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                      aria-label="Delete lorebook entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <textarea
                  value={entry.content}
                  onChange={(e) =>
                    updateEntry(entry.id, { content: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg bg-[#0d1117] border border-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-amber-500"
                />
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
