import { useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  Copy,
  FilePlus2,
  FolderOpen,
  History,
  Loader2,
  Music2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_PROJECT_TAGS,
  isProjectCompleted,
  normalizeProjectTag,
  normalizeProjectTags,
  StudioProjectSummary,
} from '../types/studio';
import { formatShortTime } from '../utils/lrcParser';

export type ProjectFilterTab = 'all' | 'completed' | 'non-completed';

interface ProjectsModalProps {
  isOpen: boolean;
  projects: StudioProjectSummary[];
  activeProjectId: string | null;
  activeProjectName: string;
  autoSaveProjects: boolean;
  isProjectDirty: boolean;
  isSavingProject: boolean;
  isLoadingProject: boolean;
  defaultProjectName: string;
  onClose: () => void;
  onToggleAutoSaveProjects: (enabled: boolean) => void;
  onSaveAsNewProject: (name: string, tags?: string[]) => Promise<void>;
  onSaveActiveProject: () => Promise<void>;
  onOpenProject: (id: string) => Promise<void>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onDuplicateProject: (id: string) => Promise<void>;
  onToggleProjectCompleted: (id: string, completed: boolean) => Promise<void>;
  onUpdateProjectTags: (id: string, tags: string[]) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onRestoreProjectVersion: (projectId: string, versionId: string) => Promise<void>;
  onCaptureProjectSnapshot: (label?: string) => void;
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
  autoSaveProjects,
  isProjectDirty,
  isSavingProject,
  isLoadingProject,
  defaultProjectName,
  onClose,
  onToggleAutoSaveProjects,
  onSaveAsNewProject,
  onSaveActiveProject,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onToggleProjectCompleted,
  onUpdateProjectTags,
  onDeleteProject,
  onRestoreProjectVersion,
  onCaptureProjectSnapshot,
  onNewBlankProject,
}: ProjectsModalProps) {
  const [newName, setNewName] = useState(defaultProjectName);
  const [newProjectTags, setNewProjectTags] = useState<string[]>([]);
  const [newProjectCustomTag, setNewProjectCustomTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<ProjectFilterTab>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [tagEditingId, setTagEditingId] = useState<string | null>(null);
  const [cardTagInput, setCardTagInput] = useState('');
  const [versionsOpenId, setVersionsOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(defaultProjectName);
      setNewProjectTags([]);
      setNewProjectCustomTag('');
      setEditingId(null);
      setTagEditingId(null);
      setCardTagInput('');
      setVersionsOpenId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen, defaultProjectName]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3200);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  const {
    completedCount,
    nonCompletedCount,
    availableTagsWithCounts,
    suggestedTags,
    filtered,
  } = useMemo(() => {
    let completedTotal = 0;
    let nonCompletedTotal = 0;
    const tagCountMap = new Map<string, { label: string; count: number }>();

    for (const p of projects) {
      if (isProjectCompleted(p)) {
        completedTotal += 1;
      } else {
        nonCompletedTotal += 1;
      }
      for (const t of normalizeProjectTags(p.tags)) {
        const key = t.toLowerCase();
        const existing = tagCountMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          tagCountMap.set(key, { label: t, count: 1 });
        }
      }
    }

    const availableTags = Array.from(tagCountMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );

    const suggestionSet = new Map<string, string>();
    for (const preset of DEFAULT_PROJECT_TAGS) {
      suggestionSet.set(preset.toLowerCase(), preset);
    }
    for (const item of availableTags) {
      const key = item.label.toLowerCase();
      if (!suggestionSet.has(key)) {
        suggestionSet.set(key, item.label);
      }
    }

    const q = searchQuery.trim().toLowerCase();
    const activeTagKey = selectedTagFilter?.toLowerCase() ?? null;

    const list = projects.filter((p) => {
      const done = isProjectCompleted(p);
      if (filterTab === 'completed' && !done) return false;
      if (filterTab === 'non-completed' && done) return false;

      const projectTags = normalizeProjectTags(p.tags);
      if (
        activeTagKey &&
        !projectTags.some((t) => t.toLowerCase() === activeTagKey)
      ) {
        return false;
      }

      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.audioFileName ?? '').toLowerCase().includes(q) ||
        p.settings.trackTitle.toLowerCase().includes(q) ||
        projectTags.some((t) => t.toLowerCase().includes(q))
      );
    });

    return {
      completedCount: completedTotal,
      nonCompletedCount: nonCompletedTotal,
      availableTagsWithCounts: availableTags,
      suggestedTags: Array.from(suggestionSet.values()),
      filtered: list,
    };
  }, [projects, filterTab, selectedTagFilter, searchQuery]);

  // Clear stale tag filter if the last project with that tag was deleted or untagged
  useEffect(() => {
    if (
      selectedTagFilter &&
      !availableTagsWithCounts.some(
        (t) => t.label.toLowerCase() === selectedTagFilter.toLowerCase()
      )
    ) {
      setSelectedTagFilter(null);
    }
  }, [availableTagsWithCounts, selectedTagFilter]);

  if (!isOpen) return null;

  const handleSaveNewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveAsNewProject(
      newName.trim() || defaultProjectName || 'Untitled Project',
      newProjectTags
    );
    setNewProjectTags([]);
    setNewProjectCustomTag('');
    if (filterTab === 'completed') {
      setFilterTab('all');
    }
  };

  const toggleNewProjectTag = (tag: string) => {
    const clean = normalizeProjectTag(tag);
    if (!clean) return;
    setNewProjectTags((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === clean.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== clean.toLowerCase());
      }
      return normalizeProjectTags([...prev, clean]);
    });
  };

  const addNewProjectCustomTag = () => {
    const clean = normalizeProjectTag(newProjectCustomTag);
    if (!clean) return;
    setNewProjectTags((prev) => normalizeProjectTags([...prev, clean]));
    setNewProjectCustomTag('');
  };

  const commitRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      await onRenameProject(id, trimmed);
    }
    setEditingId(null);
  };

  const toggleProjectTag = async (project: StudioProjectSummary, tag: string) => {
    const clean = normalizeProjectTag(tag);
    if (!clean) return;
    const current = normalizeProjectTags(project.tags);
    const exists = current.some((t) => t.toLowerCase() === clean.toLowerCase());
    const next = exists
      ? current.filter((t) => t.toLowerCase() !== clean.toLowerCase())
      : normalizeProjectTags([...current, clean]);
    await onUpdateProjectTags(project.id, next);
  };

  const addCustomTagToProject = async (project: StudioProjectSummary) => {
    const clean = normalizeProjectTag(cardTagInput);
    if (!clean) return;
    const current = normalizeProjectTags(project.tags);
    const next = normalizeProjectTags([...current, clean]);
    setCardTagInput('');
    await onUpdateProjectTags(project.id, next);
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedTagFilter || filterTab !== 'all'
  );

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
                Projects
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {projects.length} stored · {completedCount} completed · {nonCompletedCount} non-completed · Auto-save {autoSaveProjects ? 'on' : 'off'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={autoSaveProjects}
              onClick={() => onToggleAutoSaveProjects(!autoSaveProjects)}
              title="Automatically save projects as you edit and export"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                autoSaveProjects
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoSaveProjects ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              <span>Auto-save {autoSaveProjects ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={onNewBlankProject}
              disabled={isLoadingProject || isSavingProject}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
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
        <div className="px-5 py-3.5 border-b border-white/[0.07] bg-[#0d1118] space-y-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <form onSubmit={(e) => void handleSaveNewSubmit(e)} className="flex-1 flex items-center gap-2">
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

            <button
              type="button"
              onClick={() =>
                onCaptureProjectSnapshot(
                  `${newName.trim() || activeProjectName || 'Project'} Snapshot`
                )
              }
              disabled={isSavingProject || isLoadingProject}
              title="Save a Project State snapshot (settings, lyrics & media) to history"
              className="px-3 py-2 rounded-lg text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Snapshot</span>
            </button>
          </div>

          {/* Optional tags for new project */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-0.5">
              <Tag className="w-3 h-3 text-slate-500" />
              <span>Tags:</span>
            </span>
            {DEFAULT_PROJECT_TAGS.map((tag) => {
              const selected = newProjectTags.some(
                (t) => t.toLowerCase() === tag.toLowerCase()
              );
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleNewProjectTag(tag)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40'
                      : 'bg-[#090b10] text-slate-400 hover:text-slate-200 border-white/[0.08]'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {newProjectTags
              .filter(
                (t) =>
                  !DEFAULT_PROJECT_TAGS.some(
                    (p) => p.toLowerCase() === t.toLowerCase()
                  )
              )
              .map((customTag) => (
                <button
                  key={customTag}
                  type="button"
                  onClick={() => toggleNewProjectTag(customTag)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium border bg-cyan-500/15 text-cyan-200 border-cyan-400/40 flex items-center gap-1 cursor-pointer"
                >
                  <span>{customTag}</span>
                  <X className="w-2.5 h-2.5" />
                </button>
              ))}
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                value={newProjectCustomTag}
                onChange={(e) => setNewProjectCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNewProjectCustomTag();
                  }
                }}
                placeholder="Custom tag..."
                className="w-24 rounded bg-[#090b10] border border-white/[0.08] px-2 py-0.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 outline-none"
              />
              {newProjectCustomTag.trim() && (
                <button
                  type="button"
                  onClick={addNewProjectCustomTag}
                  className="px-1.5 py-0.5 rounded bg-white/[0.08] hover:bg-white/[0.14] text-[11px] text-slate-200 cursor-pointer"
                >
                  Add
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Filter Tabs & Search */}
        <div className="px-5 pt-3.5 pb-1 space-y-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div
              role="tablist"
              aria-label="Filter projects by completion status"
              className="inline-flex items-center p-1 rounded-lg bg-[#090b10] border border-white/[0.08] self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={filterTab === 'all'}
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <span>All</span>
                <span className="font-mono tabular-nums text-[10px] opacity-80">
                  {projects.length}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={filterTab === 'completed'}
                onClick={() => setFilterTab('completed')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  filterTab === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Completed</span>
                <span className="font-mono tabular-nums text-[10px] opacity-80">
                  {completedCount}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={filterTab === 'non-completed'}
                onClick={() => setFilterTab('non-completed')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  filterTab === 'non-completed'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <CircleDashed className="w-3.5 h-3.5 text-amber-400" />
                <span>Non-Completed</span>
                <span className="font-mono tabular-nums text-[10px] opacity-80">
                  {nonCompletedCount}
                </span>
              </button>
            </div>

            {projects.length > 0 && (
              <div className="relative flex-1 sm:max-w-[240px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects or tags..."
                  className="w-full rounded-lg bg-[#090b10] border border-white/[0.08] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 outline-none"
                />
              </div>
            )}
          </div>

          {/* Tag Filter Bar */}
          {availableTagsWithCounts.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter projects by tag"
            >
              <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-0.5">
                <Tag className="w-3 h-3" />
                <span>Filter tag:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedTagFilter(null)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                  selectedTagFilter === null
                    ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/35'
                    : 'bg-[#090b10] text-slate-400 hover:text-slate-200 border-white/[0.08]'
                }`}
              >
                All Tags
              </button>
              {availableTagsWithCounts.map(({ label, count }) => {
                const isSelected =
                  selectedTagFilter !== null &&
                  selectedTagFilter.toLowerCase() === label.toLowerCase();
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setSelectedTagFilter(isSelected ? null : label)
                    }
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40'
                        : 'bg-[#090b10] text-slate-300 hover:border-white/[0.18] border-white/[0.08]'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="font-mono tabular-nums text-[10px] text-slate-400">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Projects List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#090b10]/60 p-10 text-center">
              <FolderOpen className="w-8 h-8 text-cyan-400/70 mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-200">
                {projects.length === 0
                  ? 'No projects stored yet'
                  : selectedTagFilter
                  ? `No projects tagged "${selectedTagFilter}"`
                  : searchQuery.trim()
                  ? 'No projects match your search'
                  : filterTab === 'completed'
                  ? 'No completed projects yet'
                  : 'No non-completed projects'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                {projects.length === 0
                  ? 'Both completed exports and non-completed work-in-progress projects are stored automatically here so you can reopen them anytime.'
                  : hasActiveFilters
                  ? 'Try clearing your search, tag filter, or switching status tabs.'
                  : 'Projects you create or edit before exporting appear here as Non-Completed.'}
              </p>
              {hasActiveFilters && projects.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTagFilter(null);
                    setFilterTab('all');
                  }}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((project) => {
                const isActive = project.id === activeProjectId;
                const isEditing = editingId === project.id;
                const isEditingTags = tagEditingId === project.id;
                const isVersionsOpen = versionsOpenId === project.id;
                const projectVersions = project.versions ?? [];
                const completed = isProjectCompleted(project);
                const projectTags = normalizeProjectTags(project.tags);
                const clipLen = Math.max(0, project.trimEnd - project.trimStart);

                return (
                  <div
                    key={project.id}
                    className={`rounded-xl border p-3.5 flex flex-col gap-2.5 transition-colors ${
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

                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              completed
                                ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                            }`}
                          >
                            {completed ? (
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            ) : (
                              <CircleDashed className="w-2.5 h-2.5" />
                            )}
                            <span>{completed ? 'Completed' : 'Non-Completed'}</span>
                          </span>
                          {project.lastExportedAt && (
                            <span className="text-[10px] font-mono text-emerald-400/80">
                              Exported
                              {project.exportCount && project.exportCount > 1
                                ? ` ×${project.exportCount}`
                                : ''}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 truncate mt-1">
                          {project.audioFileName || 'No audio loaded'}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono tabular-nums text-slate-500 mt-1">
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

                    {/* Assigned Tags Row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {projectTags.map((tag) => {
                        const isFilteredTag =
                          selectedTagFilter !== null &&
                          selectedTagFilter.toLowerCase() === tag.toLowerCase();
                        return (
                          <span
                            key={tag}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                              isFilteredTag
                                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/45'
                                : 'bg-white/[0.04] text-slate-300 border-white/[0.09]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTagFilter(isFilteredTag ? null : tag)
                              }
                              title={`Filter by "${tag}"`}
                              className="flex items-center gap-1 cursor-pointer hover:text-cyan-200"
                            >
                              <Tag className="w-2.5 h-2.5 text-cyan-400/80" />
                              <span>{tag}</span>
                            </button>
                            {isEditingTags && (
                              <button
                                type="button"
                                onClick={() => void toggleProjectTag(project, tag)}
                                aria-label={`Remove ${tag} tag`}
                                className="text-slate-400 hover:text-rose-300 cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          setTagEditingId(isEditingTags ? null : project.id);
                          setCardTagInput('');
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                          isEditingTags
                            ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40'
                            : 'bg-transparent text-slate-400 hover:text-slate-200 border-dashed border-white/[0.12] hover:border-white/[0.25]'
                        }`}
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>
                          {isEditingTags
                            ? 'Done'
                            : projectTags.length === 0
                            ? 'Add Tag'
                            : 'Edit Tags'}
                        </span>
                      </button>
                    </div>

                    {/* Inline Tag Editor */}
                    {isEditingTags && (
                      <div className="rounded-lg bg-[#121620] border border-white/[0.08] p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {suggestedTags.map((tag) => {
                            const active = projectTags.some(
                              (t) => t.toLowerCase() === tag.toLowerCase()
                            );
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => void toggleProjectTag(project, tag)}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                                  active
                                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
                                    : 'bg-[#090b10] text-slate-400 hover:text-slate-200 border-white/[0.08]'
                                }`}
                              >
                                {active && <Check className="w-2.5 h-2.5 text-cyan-300" />}
                                <span>{tag}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={cardTagInput}
                            onChange={(e) => setCardTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void addCustomTagToProject(project);
                              }
                            }}
                            placeholder="Add custom tag..."
                            className="flex-1 min-w-0 rounded bg-[#090b10] border border-white/[0.09] px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 outline-none"
                          />
                          <button
                            type="button"
                            disabled={!cardTagInput.trim()}
                            onClick={() => void addCustomTagToProject(project)}
                            className="px-2.5 py-1 rounded text-[11px] font-medium bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void onToggleProjectCompleted(project.id, !completed)}
                          title={
                            completed
                              ? 'Move back to Non-Completed'
                              : 'Mark project as Completed'
                          }
                          aria-label={
                            completed
                              ? 'Mark as Non-Completed'
                              : 'Mark as Completed'
                          }
                          className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                            completed
                              ? 'text-slate-400 hover:text-amber-300 hover:bg-amber-500/10'
                              : 'text-emerald-300/90 hover:text-emerald-200 hover:bg-emerald-500/15'
                          }`}
                        >
                          {completed ? (
                            <>
                              <RotateCcw className="w-3 h-3" />
                              <span className="hidden sm:inline">Reopen</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="hidden sm:inline">Complete</span>
                            </>
                          )}
                        </button>
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

                      <div className="flex items-center gap-1.5">
                        {projectVersions.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setVersionsOpenId(isVersionsOpen ? null : project.id)
                            }
                            title="View & restore saved Project State snapshots"
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                              isVersionsOpen
                                ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40'
                                : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/[0.08]'
                            }`}
                          >
                            <History className="w-3 h-3 text-cyan-400" />
                            <span>{projectVersions.length}</span>
                          </button>
                        )}

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

                    {isVersionsOpen && projectVersions.length > 0 && (
                      <div className="rounded-lg bg-[#121620] border border-white/[0.08] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[10.5px] text-slate-300 font-medium">
                          <span>Project State Snapshots ({projectVersions.length})</span>
                          <span className="text-[10px] text-slate-500">
                            Settings, lyrics &amp; media
                          </span>
                        </div>
                        <div className="max-h-40 overflow-y-auto studio-scroll space-y-1.5 pr-0.5">
                          {projectVersions.map((ver) => (
                            <div
                              key={ver.id}
                              className="flex items-center justify-between gap-2 p-2 rounded-md bg-[#090b10] border border-white/[0.07]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-slate-100 truncate">
                                    {ver.label}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-white/[0.06] text-slate-400 shrink-0">
                                    {ver.reason}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {ver.audioFileName || 'No audio'}
                                  {ver.bgImageName ? ` · BG: ${ver.bgImageName}` : ''}
                                  {ver.albumImageName ? ` · Cover: ${ver.albumImageName}` : ''}
                                  {` · ${ver.lyricsCount} lyrics · ${formatUpdatedTime(ver.createdAt)}`}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={isLoadingProject || isSavingProject}
                                onClick={() =>
                                  void onRestoreProjectVersion(project.id, ver.id)
                                }
                                className="px-2 py-1 rounded text-[10.5px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>Restore</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
