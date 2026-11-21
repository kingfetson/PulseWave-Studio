import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Shuffle,
} from 'lucide-react';
import { StudioSettings } from '../types/studio';
import {
  COLOR_HARMONY_CATEGORIES,
  ColorHarmonyCategory,
  ColorHarmonyPalette,
  ColorHarmonyRule,
  CURATED_COLOR_PALETTES,
  cyclePaletteIndex,
  deriveHarmonyFromPrimary,
  findMatchingHarmonyPalette,
  pickRandomPaletteIndex,
} from '../utils/colorHarmony';

interface ColorHarmonyPanelProps {
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
}

const QUICK_HARMONY_RULES: Array<{ rule: ColorHarmonyRule; label: string; title: string }> = [
  { rule: 'Complementary', label: 'Comp', title: 'Generate complementary secondary & backdrop from primary' },
  { rule: 'Analogous', label: 'Analog', title: 'Generate analogous secondary & backdrop from primary' },
  { rule: 'Triadic', label: 'Triadic', title: 'Generate triadic secondary & backdrop from primary' },
  { rule: 'Split-Comp', label: 'Split', title: 'Generate split-complementary secondary & backdrop from primary' },
  { rule: 'Monochrome', label: 'Mono', title: 'Generate monochrome secondary & backdrop from primary' },
];

export function ColorHarmonyPanel({ settings, onUpdateSettings }: ColorHarmonyPanelProps) {
  const [category, setCategory] = useState<ColorHarmonyCategory>('all');

  const filteredPalettes = useMemo(() => {
    if (category === 'all') return CURATED_COLOR_PALETTES;
    return CURATED_COLOR_PALETTES.filter((p) => p.category === category);
  }, [category]);

  const activePalette = useMemo(
    () =>
      findMatchingHarmonyPalette(
        CURATED_COLOR_PALETTES,
        settings.primaryColor,
        settings.secondaryColor,
        settings.bgColor
      ),
    [settings.primaryColor, settings.secondaryColor, settings.bgColor]
  );

  const activeFilteredIndex = useMemo(() => {
    if (!activePalette) return -1;
    return filteredPalettes.findIndex((p) => p.id === activePalette.id);
  }, [activePalette, filteredPalettes]);

  const applyPalette = (palette: ColorHarmonyPalette) => {
    onUpdateSettings({
      themePreset: palette.themePresetKey ?? 'custom',
      primaryColor: palette.primaryColor,
      secondaryColor: palette.secondaryColor,
      bgColor: palette.bgColor,
    });
  };

  const handleCycle = (direction: 1 | -1) => {
    const nextIdx = cyclePaletteIndex(filteredPalettes.length, activeFilteredIndex, direction);
    if (nextIdx >= 0) {
      applyPalette(filteredPalettes[nextIdx]);
    }
  };

  const handleShuffle = () => {
    const nextIdx = pickRandomPaletteIndex(filteredPalettes.length, activeFilteredIndex);
    if (nextIdx >= 0) {
      applyPalette(filteredPalettes[nextIdx]);
    }
  };

  const handleSwapPrimarySecondary = () => {
    onUpdateSettings({
      themePreset: 'custom',
      primaryColor: settings.secondaryColor,
      secondaryColor: settings.primaryColor,
    });
  };

  const handleDeriveHarmony = (rule: ColorHarmonyRule) => {
    const derived = deriveHarmonyFromPrimary(settings.primaryColor, rule);
    onUpdateSettings({
      themePreset: 'custom',
      primaryColor: derived.primaryColor,
      secondaryColor: derived.secondaryColor,
      bgColor: derived.bgColor,
    });
  };

  const displayIndex =
    activeFilteredIndex >= 0
      ? `${String(activeFilteredIndex + 1).padStart(2, '0')}/${String(filteredPalettes.length).padStart(2, '0')}`
      : `00/${String(filteredPalettes.length).padStart(2, '0')}`;

  return (
    <section
      className="space-y-3"
      aria-label="Color Harmony"
      onKeyDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'INPUT') return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleCycle(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleCycle(1);
        }
      }}
    >
      {/* Header & Live Position */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-slate-200 whitespace-nowrap">Color Harmony</h2>
        <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
          {activePalette ? `${displayIndex} · ${activePalette.rule}` : `Custom · ${filteredPalettes.length} curated`}
        </span>
      </div>

      {/* Live Spectrum Preview + Cycle Controls */}
      <div className="p-2.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-2.5">
        <div
          className="relative h-10 rounded-md border border-white/[0.1] overflow-hidden flex items-center justify-between px-3"
          style={{ backgroundColor: settings.bgColor }}
        >
          <div
            className="absolute inset-x-0 bottom-0 h-1.5"
            style={{
              background: `linear-gradient(90deg, ${settings.primaryColor} 0%, ${settings.secondaryColor} 100%)`,
            }}
          />
          <div className="min-w-0 flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
              style={{ backgroundColor: settings.primaryColor }}
            />
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/25"
              style={{ backgroundColor: settings.secondaryColor }}
            />
            <span className="text-xs font-semibold text-slate-100 truncate">
              {activePalette ? activePalette.name : 'Custom Palette'}
            </span>
          </div>
          <span className="text-[10px] font-mono tabular-nums text-slate-300/85 uppercase shrink-0 ml-2">
            {settings.primaryColor} · {settings.secondaryColor}
          </span>
        </div>

        {/* Rapid Cycling Action Bar */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => handleCycle(-1)}
            title="Previous palette (Left Arrow)"
            aria-label="Previous color palette"
            className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={() => handleCycle(1)}
            title="Next palette (Right Arrow)"
            aria-label="Next color palette"
            className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={handleShuffle}
            title="Jump to a random curated palette"
            aria-label="Shuffle color palette"
            className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Shuffle className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>Shuffle</span>
          </button>

          <button
            type="button"
            onClick={handleSwapPrimarySecondary}
            title="Swap Primary and Secondary colors"
            aria-label="Swap primary and secondary colors"
            className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeftRight className="w-3 h-3 text-slate-300 shrink-0" />
            <span>Swap</span>
          </button>
        </div>
      </div>

      {/* Category Filter Strip */}
      <div
        role="tablist"
        aria-label="Filter color harmonies by mood"
        className="flex items-center gap-1 overflow-x-auto studio-scroll pb-0.5"
      >
        {COLOR_HARMONY_CATEGORIES.map((cat) => {
          const isSelected = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setCategory(cat.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'bg-cyan-400 text-[#090b10] font-semibold'
                  : 'bg-[#090b10] text-slate-400 hover:text-slate-200 border border-white/[0.07]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Curated Palette Grid */}
      <div className="grid grid-cols-2 gap-1.5 max-h-[244px] overflow-y-auto studio-scroll pr-0.5">
        {filteredPalettes.map((palette) => {
          const isActive = activePalette?.id === palette.id;
          return (
            <button
              key={palette.id}
              type="button"
              onClick={() => applyPalette(palette)}
              className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                isActive
                  ? 'bg-cyan-500/12 border-cyan-400/50 text-slate-100'
                  : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.18]'
              }`}
            >
              <div className="h-2.5 w-full rounded-sm overflow-hidden flex border border-white/15 mb-1.5">
                <span
                  className="h-full flex-[45]"
                  style={{ backgroundColor: palette.primaryColor }}
                />
                <span
                  className="h-full flex-[35]"
                  style={{ backgroundColor: palette.secondaryColor }}
                />
                <span
                  className="h-full flex-[20]"
                  style={{ backgroundColor: palette.bgColor }}
                />
              </div>
              <div className="text-[11px] font-medium truncate">{palette.name}</div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                {palette.rule}
              </div>
            </button>
          );
        })}
      </div>

      {/* Color-Theory Derive Strip (based on current Primary Color) */}
      <div className="pt-0.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10.5px] text-slate-400">
          <span>Derive from Primary</span>
          <span className="font-mono tabular-nums uppercase text-slate-500">
            {settings.primaryColor}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {QUICK_HARMONY_RULES.map((item) => (
            <button
              key={item.rule}
              type="button"
              onClick={() => handleDeriveHarmony(item.rule)}
              title={item.title}
              className="py-1.5 px-1 rounded-md text-[10.5px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-slate-300 hover:text-cyan-300 border border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
