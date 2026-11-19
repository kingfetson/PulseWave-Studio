import { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  FilePlus2,
  FolderOpen,
  Loader2,
  Music2,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { StudioProjectSummary } from '../types/studio';
import { formatShortTime } from '../utils/lrcParser';

interface ProjectsModalProps {
  isOpen: boolean;
  projects: StudioProjectSummary[];
  activeProjectId: string | null;
  activeProjectName: string;
  isProjectDirty: boolean;
  isSavingProject: boolean;
  isLoadingProject: boolean;
  defaultProjectName: string;
  onClose: () => void;
  onSaveAsNewProject: (name: string) => Promise<void>;
  onSaveActiveProject: () => Promise<void>;
  onOpenProject: (id: string) => Promise<void>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onDuplicateProject: (id: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onNewBlankProject: () => void;
}

function formatUpdatedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ProjectsModal({
  isOpen,
  projects,
  activeProjectId,
  activeProjectName,
  isProjectDirty,
  isSavingProject,
  isLoadingProject,
  defaultProjectName,
  onClose,
  onSaveAsNewProject,
  onSaveActiveProject,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onNewBlankProject,
}: ProjectsModalProps) {
  const [newName, setNewName] = useState(defaultProjectName);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(defaultProjectName);
      setEditingId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen, defaultProjectName]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3200);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  if (!isOpen) return null;

  const filtered = projects.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.audioFileName ?? '').toLowerCase().includes(q) ||
      p.settings.trackTitle.toLowerCase().includes(q)
    );
  });

  const handleSaveNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSaveAsNewProject(newName.trim() || defaultProjectName || 'Untitled Project');
  };

  const commitRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      await onRenameProject(id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="projects-modal-title"
    >
      <div className="w-full max-w-3xl rounded-xl bg-[#121620] border border-white/[0.1] shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="projects-modal-title" className="text-sm font-semibold text-slate-100">
                Studio Projects
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {projects.length} kept locally · Audio, images, trim points, lyrics &amp; settings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onNewBlankProject}
              disabled={isLoadingProject || isSavingProject}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>New Blank</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close projects modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Save / Create Project Bar */}
        <div className="px-5 py-3.5 border-b border-white/[0.07] bg-[#0d1118] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <form onSubmit={handleSaveNewSubmit} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name..."
              className="flex-1 min-w-0 rounded-lg bg-[#090b10] border border-white/[0.09] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 outline-none"
            />
            <button
              type="submit"
              disabled={isSavingProject || isLoadingProject}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {isSavingProject ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{activeProjectId ? 'Save As New' : 'Save Project'}</span>
            </button>
          </form>

          {activeProjectId && (
            <button
              type="button"
              onClick={() => void onSaveActiveProject()}
              disabled={isSavingProject || isLoadingProject}
              className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-100 border border-white/[0.1] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Update &ldquo;{activeProjectName}&rdquo;{isProjectDirty ? ' *' : ''}
              </span>
            </button>
          )}
        </div>

        {/* Search when > 3 projects */}
        {projects.length > 3 && (
          <div className="px-5 pt-3 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter saved projects by name or track..."
                className="w-full rounded-lg bg-[#090b10] border border-white/[0.08] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 outline-none"
              />
            </div>
          </div>
        )}

        {/* Projects List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#090b10]/60 p-10 text-center">
              <FolderOpen className="w-8 h-8 text-cyan-400/70 mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-200">
                {projects.length === 0
                  ? 'No projects saved yet'
                  : 'No projects match your filter'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                {projects.length === 0
                  ? 'Save your current track, lyrics, cover art, trim range, and visualizer settings above to keep projects across sessions.'
                  : 'Try clearing the search query to see all kept projects.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((project) => {
                const isActive = project.id === activeProjectId;
                const isEditing = editingId === project.id;
                const clipLen = Math.max(0, project.trimEnd - project.trimStart);

                return (
                  <div
                    key={project.id}
                    className={`rounded-xl border p-3.5 flex flex-col gap-3 transition-colors ${
                      isActive
                        ? 'bg-cyan-500/[0.06] border-cyan-400/40'
                        : 'bg-[#090b10] border-white/[0.08] hover:border-white/[0.16]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div className="w-24 h-16 rounded-lg bg-[#05070b] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center relative">
                        {project.thumbnailDataUrl ? (
                          <img
                            src={project.thumbnailDataUrl}
                            alt={project.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Music2 className="w-5 h-5 text-slate-600" />
                        )}
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/75 text-[9px] font-mono text-slate-300">
                          {project.settings.aspectRatio}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitRename(project.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="w-full rounded bg-[#121620] border border-cyan-400/50 px-2 py-0.5 text-xs text-slate-100 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void commitRename(project.id)}
                              className="p-1 rounded bg-cyan-400 text-[#090b10] cursor-pointer"
                              aria-label="Confirm rename"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1.5">
                            <h4 className="text-xs font-semibold text-slate-100 truncate">
                              {project.name}
                            </h4>
                            {isActive && (
                              <span className="text-[10px] font-mono uppercase tracking-wide text-cyan-400 shrink-0">
                                Active
                              </span>
                            )}
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {project.audioFileName || 'No audio loaded'}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono tabular-nums text-slate-500 mt-1.5">
                          {project.duration > 0 && (
                            <span>
                              {formatShortTime(project.trimStart)}–{formatShortTime(project.trimEnd)}{' '}
                              ({clipLen.toFixed(1)}s)
                            </span>
                          )}
                          <span>{project.lyrics.length} lyrics</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatUpdatedTime(project.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(project.id);
                            setEditingName(project.name);
                          }}
                          title="Rename project"
                          aria-label="Rename project"
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDuplicateProject(project.id)}
                          title="Duplicate project"
                          aria-label="Duplicate project"
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmDeleteId === project.id) {
                              setConfirmDeleteId(null);
                              void onDeleteProject(project.id);
                            } else {
                              setConfirmDeleteId(project.id);
                            }
                          }}
                          title="Delete project"
                          className={`px-2 py-1 rounded-md text-[11px] transition-colors flex items-center gap-1 cursor-pointer ${
                            confirmDeleteId === project.id
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-medium'
                              : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {confirmDeleteId === project.id && <span>Confirm</span>}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={isLoadingProject || isSavingProject}
                        onClick={() => void onOpenProject(project.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-45 ${
                          isActive
                            ? 'bg-white/[0.07] hover:bg-white/[0.12] text-slate-200 border border-white/[0.1]'
                            : 'bg-cyan-400 hover:bg-cyan-300 text-[#090b10]'
                        }`}
                      >
                        {isLoadingProject ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <FolderOpen className="w-3 h-3" />
                        )}
                        <span>{isActive ? 'Reload' : 'Open'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
