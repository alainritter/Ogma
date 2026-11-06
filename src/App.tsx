import { useState, useEffect, useMemo, useRef } from 'react';
import GridLayout from 'react-grid-layout/legacy';
import { MetricsStatusDot } from './components/metrics/MetricsShell';
import { CoresWidget } from './components/metrics/CoresWidget';
import { CpuWidget } from './components/metrics/CpuWidget';
import { MemoryWidget } from './components/metrics/MemoryWidget';
import { MetricsGraphWidget } from './components/metrics/MetricsGraphWidget';
import { VramWidget } from './components/metrics/VramWidget';
import { StorageWidget } from './components/metrics/StorageWidget';
import { TemperatureWidget } from './components/metrics/TemperatureWidget';
import { WeatherWidget } from './components/WeatherWidget';
import { GitHubStats } from './components/GitHubStats';
import { ServiceStatus } from './components/ServiceStatus';
import { CiStatus } from './components/CiStatus';
import { DriftScore } from './components/DriftScore';
import { NetworkOutageMap } from './components/NetworkOutageMap';
import { WebScraper } from './components/WebScraper';
import { MarkdownEditor } from './components/MarkdownEditor';
import { SoundManager } from './components/SoundManager';
import { ThemeToggle } from './components/ThemeToggle';
import { GitStatus } from './components/GitStatus';
import { DockerWidget } from './components/DockerWidget';
import { KanbanBoard } from './components/KanbanBoard';
import { BackupWidget } from './components/BackupWidget';
import { SettingsPanel } from './components/SettingsPanel';
import { useSetting } from './lib/settings';
import { Toaster } from './components/Toaster';
import {
  RotateCcw,
  Eye,
  EyeOff,
  Save,
  Settings,
  Activity,
  CircleCheck,
  Gauge,
  ChartLine,
  CloudSun,
  Container,
  HardDriveDownload,
  Cpu,
  FileText,
  GitBranch,
  Github,
  Globe,
  Gpu,
  HardDrive,
  MemoryStick,
  Move,
  Radio,
  SquareKanban,
  Thermometer,
} from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import { apiFetch } from './lib/api';

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

// 12-column grid layout with standardized sizes.
// Every row's widths sum to exactly 12 and all items in a row share the same
// height, so react-grid-layout's vertical compaction can never stagger
// columns into a "staircase" — each row's bottom edge lines up cleanly for
// the next row.
const defaultLayout = [
  // Row 1: Kanban board (full width, on top)
  { i: 'kanban', x: 0, y: 0, w: 12, h: 5, minW: 6, minH: 4 },

  // Row 2: Dev tools
  { i: 'git-status', x: 0, y: 5, w: 6, h: 6, minW: 4, minH: 4 },
  { i: 'docker', x: 6, y: 5, w: 6, h: 6, minW: 4, minH: 4 },

  // Row 3: System values
  { i: 'metrics-cpu', x: 0, y: 11, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-memory', x: 3, y: 11, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-vram', x: 6, y: 11, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-temp', x: 9, y: 11, w: 3, h: 2, minW: 3, minH: 2 },

  // Row 4: History, cores, storage
  { i: 'metrics-graph', x: 0, y: 13, w: 6, h: 4, minW: 4, minH: 3 },
  { i: 'metrics-cores', x: 6, y: 13, w: 3, h: 4, minW: 3, minH: 2 },
  { i: 'metrics-storage', x: 9, y: 13, w: 3, h: 4, minW: 3, minH: 3 },

  // Row 5: Services
  { i: 'service-status', x: 0, y: 17, w: 4, h: 4, minW: 4, minH: 4 },
  { i: 'github', x: 4, y: 17, w: 4, h: 4, minW: 4, minH: 4 },
  { i: 'weather', x: 8, y: 17, w: 4, h: 4, minW: 4, minH: 4 },

  // Row 6: Network + scraper
  { i: 'network-outage', x: 0, y: 21, w: 6, h: 4, minW: 6, minH: 4 },
  { i: 'web-scraper', x: 6, y: 21, w: 6, h: 4, minW: 3, minH: 3 },

  // Row 7: CI status
  { i: 'ci-status', x: 0, y: 25, w: 12, h: 5, minW: 3, minH: 3 },

  // Row 8: Drift score
  { i: 'drift', x: 0, y: 30, w: 12, h: 5, minW: 4, minH: 3 },

  // Row 9: Backups
  { i: 'backups', x: 0, y: 35, w: 12, h: 6, minW: 3, minH: 3 },

  // Row 10: Markdown editor (full width for editing room)
  { i: 'markdown-editor', x: 0, y: 41, w: 12, h: 4, minW: 6, minH: 3 },
];

// Below this width the grid collapses to one column (phones via the Pforte gateway).
const MOBILE_BREAKPOINT = 768;
// Below this width (and above phones) the tablet layout applies.
const TABLET_BREAKPOINT = 1280;
// Page padding: px-3 on phones, px-6 above; the grid width must match.
const gridWidth = (viewport: number) => viewport - (viewport < MOBILE_BREAKPOINT ? 24 : 48);
// The tablet view (e.g. the app on half a screen) has its own layout, so editing it never
// touches the desktop one. Until it is edited, tabletDefaultLayout applies.
const TABLET_LAYOUT_KEY = 'dashboard-layout-tablet';

function loadLayout(key: string): LayoutItem[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      Array.isArray(parsed) &&
      parsed.every(
        item =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.i === 'string' &&
          typeof item.x === 'number'
      )
    ) {
      return parsed;
    }
  } catch {
    // Silent fallback to default
  }
  return null;
}

// Tablet default (12 columns on half a screen): four metric tiles in a row, history full
// width, cores + storage side by side, then three narrow service columns.
const tabletDefaultLayout: LayoutItem[] = [
  { i: 'kanban', x: 0, y: 0, w: 12, h: 5, minW: 6, minH: 4 },
  { i: 'metrics-cpu', x: 0, y: 5, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-memory', x: 3, y: 5, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-vram', x: 6, y: 5, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-temp', x: 9, y: 5, w: 3, h: 2, minW: 3, minH: 2 },
  { i: 'metrics-graph', x: 0, y: 7, w: 12, h: 3, minW: 6, minH: 3 },
  { i: 'metrics-cores', x: 0, y: 10, w: 6, h: 3, minW: 3, minH: 2 },
  { i: 'metrics-storage', x: 6, y: 10, w: 6, h: 3, minW: 3, minH: 3 },
  { i: 'docker', x: 0, y: 13, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'service-status', x: 4, y: 13, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'network-outage', x: 8, y: 13, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'git-status', x: 0, y: 19, w: 6, h: 5, minW: 4, minH: 4 },
  { i: 'github', x: 6, y: 19, w: 3, h: 5, minW: 3, minH: 4 },
  { i: 'weather', x: 9, y: 19, w: 3, h: 5, minW: 3, minH: 4 },
  { i: 'web-scraper', x: 0, y: 24, w: 12, h: 4, minW: 3, minH: 3 },
  { i: 'ci-status', x: 0, y: 28, w: 12, h: 5, minW: 3, minH: 3 },
  { i: 'drift', x: 0, y: 33, w: 12, h: 5, minW: 4, minH: 3 },
  { i: 'backups', x: 0, y: 38, w: 12, h: 6, minW: 3, minH: 3 },
  { i: 'markdown-editor', x: 0, y: 44, w: 12, h: 4, minW: 6, minH: 3 },
];

const defaultEnabledWidgets = {
  kanban: true,
  'git-status': true,
  docker: true,
  backups: true,
  'ci-status': true,
  drift: true,
  'metrics-cpu': true,
  'metrics-cores': true,
  'metrics-memory': true,
  'metrics-vram': true,
  'metrics-temp': true,
  'metrics-graph': true,
  'metrics-storage': true,
  'service-status': true,
  github: true,
  weather: true,
  'network-outage': true,
  'web-scraper': true,
  'markdown-editor': true,
};

type WidgetStatus = 'ready' | 'warning' | 'disabled';

interface WidgetHealth {
  status: WidgetStatus;
  message?: string;
}

const widgetConfig = {
  kanban: { name: 'KANBAN', icon: SquareKanban, component: KanbanBoard },
  'git-status': { name: 'GIT STATUS', icon: GitBranch, component: GitStatus },
  docker: { name: 'DOCKER', icon: Container, component: DockerWidget },
  'ci-status': { name: 'CI STATUS', icon: CircleCheck, component: CiStatus },
  drift: { name: 'DRIFT', icon: Gauge, component: DriftScore },
  backups: { name: 'BACKUPS', icon: HardDriveDownload, component: BackupWidget },
  'metrics-cpu': { name: 'CPU', icon: Cpu, component: CpuWidget },
  'metrics-cores': { name: 'CORES', icon: Cpu, component: CoresWidget },
  'metrics-memory': { name: 'MEMORY', icon: MemoryStick, component: MemoryWidget },
  'metrics-vram': { name: 'VRAM', icon: Gpu, component: VramWidget },
  'metrics-temp': { name: 'TEMPERATURE', icon: Thermometer, component: TemperatureWidget },
  'metrics-graph': { name: 'PERFORMANCE', icon: ChartLine, component: MetricsGraphWidget },
  'metrics-storage': { name: 'STORAGE', icon: HardDrive, component: StorageWidget },
  'service-status': { name: 'SERVICE STATUS', icon: Activity, component: ServiceStatus },
  github: { name: 'GITHUB STATS', icon: Github, component: GitHubStats },
  weather: { name: 'WEATHER', icon: CloudSun, component: WeatherWidget },
  'network-outage': { name: 'NETWORK OUTAGES', icon: Radio, component: NetworkOutageMap },
  'web-scraper': { name: 'WEB SCRAPER', icon: Globe, component: WebScraper },
  'markdown-editor': { name: 'MARKDOWN EDITOR', icon: FileText, component: MarkdownEditor },
};

// Drops keys of removed widgets and fills in widgets the saved selection predates.
function parseEnabledWidgets(data: unknown): Record<string, boolean> | null {
  if (typeof data !== 'object' || data === null) return null;
  const entries = Object.entries(data).filter(([key]) => Object.hasOwn(widgetConfig, key));
  if (!entries.every(([, value]) => typeof value === 'boolean')) return null;
  return { ...defaultEnabledWidgets, ...Object.fromEntries(entries) };
}

const METRIC_WIDGET_IDS = [
  'metrics-cpu',
  'metrics-memory',
  'metrics-graph',
  'metrics-vram',
  'metrics-storage',
  'metrics-temp',
];

// One-time migration: split legacy single 'metrics' widget into 6 individual
// metric widgets. Runs at module load so useState initializers see the new keys.
function migrateLegacyMetrics() {
  try {
    const layoutRaw = localStorage.getItem('dashboard-layout');
    if (layoutRaw) {
      const parsed = JSON.parse(layoutRaw);
      if (
        Array.isArray(parsed) &&
        parsed.some((i: { i: string }) => i.i === 'metrics') &&
        !parsed.some((i: { i: string }) => METRIC_WIDGET_IDS.includes(i.i))
      ) {
        const legacy = parsed.find((i: LayoutItem) => i.i === 'metrics') ?? {
          i: 'metrics',
          x: 6,
          y: 0,
          w: 6,
          h: 6,
        };
        const replacements: LayoutItem[] = [
          { i: 'metrics-cpu', x: legacy.x, y: legacy.y, w: 3, h: 4, minW: 3, minH: 3 },
          { i: 'metrics-memory', x: legacy.x + 3, y: legacy.y, w: 3, h: 4, minW: 3, minH: 3 },
          { i: 'metrics-graph', x: legacy.x, y: legacy.y + 4, w: 6, h: 4, minW: 4, minH: 3 },
          { i: 'metrics-vram', x: legacy.x, y: legacy.y + 8, w: 3, h: 4, minW: 3, minH: 3 },
          { i: 'metrics-storage', x: legacy.x + 3, y: legacy.y + 8, w: 3, h: 4, minW: 3, minH: 3 },
          { i: 'metrics-temp', x: legacy.x, y: legacy.y + 12, w: 3, h: 3, minW: 3, minH: 3 },
        ];
        const filtered = parsed.filter((i: LayoutItem) => i.i !== 'metrics');
        localStorage.setItem('dashboard-layout', JSON.stringify([...filtered, ...replacements]));
      }
    }
  } catch {
    // Silent migration failure — falls back to defaults
  }

  try {
    const enabledRaw = localStorage.getItem('enabled-widgets');
    if (enabledRaw) {
      const parsed = JSON.parse(enabledRaw);
      if (parsed && typeof parsed === 'object' && 'metrics' in parsed) {
        const { metrics: legacyEnabled, ...rest } = parsed;
        const next: Record<string, boolean> = { ...rest };
        for (const id of METRIC_WIDGET_IDS) {
          if (!(id in next)) next[id] = legacyEnabled === true;
        }
        localStorage.setItem('enabled-widgets', JSON.stringify(next));
      }
    }
  } catch {
    // Silent migration failure
  }
}

// Bump whenever defaultLayout's positions/sizes change meaningfully.
// Stale saved layouts (from an older defaultLayout revision) are discarded
// so users get the fixed layout automatically, without having to know to
// press "Reset".
const LAYOUT_VERSION = 12;

function invalidateStaleLayout() {
  try {
    const storedVersion = localStorage.getItem('dashboard-layout-version');
    if (storedVersion !== String(LAYOUT_VERSION)) {
      localStorage.removeItem('dashboard-layout');
      localStorage.removeItem(TABLET_LAYOUT_KEY);
      localStorage.setItem('dashboard-layout-version', String(LAYOUT_VERSION));
    }
  } catch {
    // Silent fallback — saved layout (if any) is kept
  }
}

invalidateStaleLayout();
migrateLegacyMetrics();

// Check widget health (service availability, config status)
async function checkWidgetHealth(widgetId: string): Promise<WidgetHealth> {
  try {
    switch (widgetId) {
      case 'web-scraper':
        // Check backend server
        try {
          const res = await apiFetch('/api/metrics', { signal: AbortSignal.timeout(3000) });
          if (!res.ok) throw new Error('Backend not available');
          return { status: 'ready' };
        } catch {
          return { status: 'warning', message: 'Backend server not running' };
        }

      case 'ci-status':
        try {
          const res = await apiFetch('/api/ci/status', { signal: AbortSignal.timeout(35000) });
          const body = await res.json();
          if (!res.ok || body.error) throw new Error(body.error || 'CI API not available');
          return { status: 'ready' };
        } catch (err) {
          return {
            status: 'warning',
            message: err instanceof Error ? err.message : 'CI API not available',
          };
        }

      case 'kanban':
        try {
          const res = await apiFetch('/api/kanban/tasks', { signal: AbortSignal.timeout(3000) });
          if (!res.ok) throw new Error('Kanban API not available');
          return { status: 'ready' };
        } catch {
          return { status: 'warning', message: 'Kanban API not available' };
        }

      default:
        // All other widgets have no external dependencies
        return { status: 'ready' };
    }
  } catch {
    return { status: 'warning', message: 'Service check failed' };
  }
}

function App() {
  // Harmonia UI-sound toggle (loaded as /ds/sounds.js in index.html) is mounted into the header
  const dsSoundRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = dsSoundRef.current;
    (window as unknown as { dsSound?: { mountToggle(p: HTMLElement): void } }).dsSound?.mountToggle(
      host!
    );
    return () => host?.replaceChildren();
  }, []);

  const [layout, setLayout] = useState<LayoutItem[]>(
    () => loadLayout('dashboard-layout') ?? defaultLayout
  );
  // null = not edited yet, tabletDefaultLayout applies
  const [tabletSaved, setTabletSaved] = useState<LayoutItem[] | null>(() =>
    loadLayout(TABLET_LAYOUT_KEY)
  );

  const [enabledWidgets, setEnabledWidgets] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('enabled-widgets');
      if (saved) {
        const parsed = parseEnabledWidgets(JSON.parse(saved));
        if (parsed) return parsed;
      }
    } catch {
      // Silent fallback to default
    }
    return defaultEnabledWidgets;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [showWidgetControls, setShowWidgetControls] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [containerWidth, setContainerWidth] = useState(
    typeof window !== 'undefined' ? gridWidth(window.innerWidth) : 2500
  );

  // Persisted + synced with SettingsPanel automatically
  const [githubUsername] = useSetting('github-username', '');
  const [showSettings, setShowSettings] = useState(false);

  const [widgetHealth, setWidgetHealth] = useState<Record<string, WidgetHealth>>({});

  // Periodic health check for enabled widgets
  useEffect(() => {
    const checkAllWidgets = async () => {
      const healthChecks = await Promise.all(
        Object.keys(widgetConfig).map(async widgetId => {
          if (!enabledWidgets[widgetId]) {
            return [widgetId, { status: 'disabled' as WidgetStatus }];
          }
          const health = await checkWidgetHealth(widgetId);
          return [widgetId, health];
        })
      );
      setWidgetHealth(Object.fromEntries(healthChecks));
    };

    checkAllWidgets();
    const interval = setInterval(checkAllWidgets, 60000); // Check every 60s (reduced from 10s)
    return () => clearInterval(interval);
  }, [enabledWidgets]);

  // Side effects (localStorage, setLayout) live outside the state updater —
  // updaters must be pure (StrictMode runs them twice).
  const toggleWidget = (widgetId: string) => {
    const wasEnabled = enabledWidgets[widgetId];
    const updated = { ...enabledWidgets, [widgetId]: !wasEnabled };
    setEnabledWidgets(updated);
    localStorage.setItem('enabled-widgets', JSON.stringify(updated));

    if (!wasEnabled && !layout.some((item: { i: string }) => item.i === widgetId)) {
      const maxY = layout.reduce(
        (max: number, item: LayoutItem) => Math.max(max, item.y + item.h),
        0
      );

      const newItem = {
        i: widgetId,
        x: 0,
        y: maxY,
        w: 12,
        h: 6,
        minW: 4,
        minH: 4,
      };

      const newLayout = [...layout, newItem];
      setLayout(newLayout);
      localStorage.setItem('dashboard-layout', JSON.stringify(newLayout));
    }

    if (!wasEnabled && tabletSaved && !tabletSaved.some(item => item.i === widgetId)) {
      const maxY = tabletSaved.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      const next = [...tabletSaved, { i: widgetId, x: 0, y: maxY, w: 12, h: 4, minW: 3, minH: 2 }];
      setTabletSaved(next);
      localStorage.setItem(TABLET_LAYOUT_KEY, JSON.stringify(next));
    }
  };

  const isMobile = containerWidth < MOBILE_BREAKPOINT - 24;
  const isTablet = !isMobile && containerWidth < TABLET_BREAKPOINT - 48;
  const isDesktop = !isMobile && !isTablet;
  // Phones: one column in desktop reading order (row by row, left to right), fixed in
  // place. Derived on the fly and never saved, so the desktop layout stays untouched.
  const mobileLayout = useMemo(() => {
    const stacked: LayoutItem[] = [];
    for (const item of [...layout].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const prev = stacked.at(-1);
      stacked.push({
        ...item,
        x: 0,
        y: prev ? prev.y + prev.h : 0,
        w: 1,
        minW: 1,
        h: Math.max(item.h, 4),
      });
    }
    return stacked;
  }, [layout]);

  // Tablets: 12 columns, editable and saved on its own (see TABLET_LAYOUT_KEY).
  const tabletLayout = useMemo(() => tabletSaved ?? tabletDefaultLayout, [tabletSaved]);

  const manualSave = () => {
    if (isTablet) localStorage.setItem(TABLET_LAYOUT_KEY, JSON.stringify(tabletLayout));
    else localStorage.setItem('dashboard-layout', JSON.stringify(layout));
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  // react-grid-layout only reports items of mounted (enabled) widgets; keep the
  // last position of disabled ones so re-enabling restores it.
  const saveLayout = (newLayout: ReadonlyArray<LayoutItem>) => {
    const ids = new Set(newLayout.map(item => item.i));
    const merged = [...newLayout, ...layout.filter(item => !ids.has(item.i))];
    setLayout(merged);
    localStorage.setItem('dashboard-layout', JSON.stringify(merged));
  };

  // Saved on drag/resize stop only, so merely viewing the tablet view keeps following the
  // desktop layout. Keeps the last position of disabled widgets like saveLayout.
  const saveTabletLayout = (newLayout: ReadonlyArray<LayoutItem>) => {
    const ids = new Set(newLayout.map(item => item.i));
    const merged = [...newLayout, ...tabletLayout.filter(item => !ids.has(item.i))];
    setTabletSaved(merged);
    localStorage.setItem(TABLET_LAYOUT_KEY, JSON.stringify(merged));
  };

  const resetLayout = () => {
    if (isTablet) {
      setTabletSaved(null);
      localStorage.removeItem(TABLET_LAYOUT_KEY);
      return;
    }
    // Reset to default layout but only include enabled widgets
    const resetLayout = defaultLayout.filter(item => enabledWidgets[item.i]);
    setLayout(resetLayout);
    localStorage.setItem('dashboard-layout', JSON.stringify(resetLayout));
  };

  useEffect(() => {
    const handleResize = () => {
      setContainerWidth(gridWidth(window.innerWidth));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="ds-header">
        <div className="ds-brand">
          <img src="/favicon.svg" alt="" />
          <h1>Ogma</h1>
        </div>
        <div className="ds-header-actions">
          <span ref={dsSoundRef} className="contents" />
          <SoundManager />
          <div className="w-px h-6 bg-line" />
          <button
            onClick={() => setShowWidgetControls(!showWidgetControls)}
            className="ds-btn"
            title="Toggle Widgets"
          >
            {showWidgetControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">Widgets</span>
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`ds-btn ${showSettings ? 'active' : ''}`}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          {/* Layout actions only where the layout can be edited (not in the fixed phone view) */}
          {!isMobile && (
            <>
              <button
                onClick={manualSave}
                className={`ds-btn ${showSaved ? 'text-good' : ''}`}
                title="Save Layout"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">{showSaved ? 'Saved!' : 'Save'}</span>
              </button>
              <button onClick={resetLayout} className="ds-btn" title="Reset Layout to Default">
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>

      {showWidgetControls && (
        <div className="px-3 py-4 md:px-6 border-b border-line bg-elevated space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-accent">WIDGET VISIBILITY</h3>
              <div className="flex items-center gap-4 text-xs text-text-dim">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-good" />
                  <span>Running</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-warn widget-pulse" />
                  <span>Warning</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-bad" />
                  <span>Disabled</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {Object.entries(widgetConfig).map(([id, config]) => {
                const health = widgetHealth[id] || { status: 'ready' };
                const isEnabled = enabledWidgets[id];
                const hasWarning = isEnabled && health.status === 'warning';

                return (
                  <button
                    key={id}
                    onClick={() => toggleWidget(id)}
                    title={health.message || (isEnabled ? 'Enabled' : 'Disabled')}
                    className={`p-2 rounded text-xs font-mono transition-all flex items-center gap-2 relative ${
                      !isEnabled
                        ? 'bg-bad/15 border border-bad/50 text-bad'
                        : hasWarning
                          ? 'bg-warn/15 border border-warn/50 text-warn'
                          : 'bg-good/15 border border-good/50 text-good'
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        !isEnabled ? 'bg-bad' : hasWarning ? 'bg-warn widget-pulse' : 'bg-good'
                      }`}
                    />
                    <config.icon size={14} className="shrink-0" />
                    <span className="truncate">{config.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
      <Toaster />

      <div className="px-3 py-3 md:px-6 md:py-6">
        <GridLayout
          className="layout"
          layout={isMobile ? mobileLayout : isTablet ? tabletLayout : layout}
          cols={isMobile ? 1 : 12}
          rowHeight={isMobile ? 80 : 120}
          width={containerWidth}
          onLayoutChange={isDesktop ? saveLayout : undefined}
          onDragStart={() => setIsDragging(true)}
          onDragStop={newLayout => {
            setIsDragging(false);
            if (isTablet) saveTabletLayout(newLayout);
          }}
          onResizeStop={newLayout => {
            if (isTablet) saveTabletLayout(newLayout);
          }}
          draggableHandle=".drag-handle"
          isDraggable={!isMobile}
          isResizable={!isMobile}
          compactType="vertical"
          preventCollision={false}
        >
          {Object.entries(widgetConfig).map(([id, config]) => {
            if (!enabledWidgets[id]) return null;

            const WidgetComponent = config.component;

            return (
              <div
                key={id}
                // Grid falls back to this for a re-enabled widget it no longer tracks
                data-grid={layout.find(item => item.i === id)}
                className={`flex flex-col${isDragging ? ' dragging' : ''}`}
                style={{ pointerEvents: 'auto' }}
              >
                <div className="drag-handle group cursor-move shrink-0 p-2 border-b border-line hover:bg-accent/10 select-none">
                  <div className="text-xs font-bold text-text-dim flex items-center gap-1.5">
                    <config.icon size={14} />
                    {config.name}
                    <Move
                      size={14}
                      className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    {id.startsWith('metrics-') && <MetricsStatusDot />}
                  </div>
                </div>
                <div
                  className="p-4 overflow-auto flex-1 min-h-0 @container"
                  style={{ pointerEvents: 'auto' }}
                >
                  {id === 'github' ? (
                    <WidgetComponent username={githubUsername} />
                  ) : (
                    <WidgetComponent />
                  )}
                </div>
              </div>
            );
          })}
        </GridLayout>

        <footer className="mt-12 py-6 border-t border-line text-center">
          <p className="text-sm text-text-muted">
            Ogma // Powered by React 19 + Vite 7 + Tailwind 4
          </p>
          <p className="text-xs text-text-muted mt-2">Widgets per Drag &amp; Drop anordnen</p>
          <p className="text-xs text-text-muted mt-2">
            Crafted by <span style={{ color: 'var(--color-accent)' }}>𐌀𐌋𐌀𐌉𐌍</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
