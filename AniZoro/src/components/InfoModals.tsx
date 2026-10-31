import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  HelpCircle,
  Mail,
  Info,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  SlidersHorizontal,
  Database,
  Send,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  Languages,
  Server,
  Lock,
  LifeBuoy,
  Scale,
} from 'lucide-react';
import AniZoroLogo from './AniZoroLogo';
import { STREAM_SERVERS, DEFAULT_SERVER, isServerKey } from '../lib/servers';
import { readPref, writePref, SUB_LANG_KEY } from '../lib/prefs';
import { SUB_DEFAULT_KEY, readSubDefault, type SubDefault } from '../lib/subtitles';
import { APP_VERSION } from '../lib/version';

export type InfoModalTab = 'settings' | 'data' | 'about' | 'terms' | 'privacy' | 'faq' | 'contact' | 'dmca';

export const DMCA_POLICY_URL = 'https://app.websitepolicies.com/policies/view/julb2k97';
export const CONTACT_EMAILS = ['lavaking0622@gmail.com', 'lavaking06229@gmail.com'];

const LEGAL_UPDATED = 'October 2026';

interface InfoModalsProps {
  isOpen: boolean;
  initialTab?: InfoModalTab;
  onClose: () => void;
}

/* ------------------------------------------------------------------------------------------------ */
/* Preferences (stored under the same keys the player reads)                                         */
/* ------------------------------------------------------------------------------------------------ */

interface Prefs {
  format: 'sub' | 'dub';
  server: string;
  subdef: SubDefault;
  autoplay: boolean;
  autoskip: boolean;
  autonext: boolean;
  skipfiller: boolean;
}

const BOOL_KEYS = {
  autoplay: 'anizoro_autoplay',
  autoskip: 'anizoro_autoskip',
  autonext: 'anizoro_autonext',
  skipfiller: 'anizoro_skipfiller',
} as const;
const FORMAT_KEY = 'anizoro_pref_format';
const SERVER_KEY = 'anizoro_pref_server';

const readBool = (key: string): boolean => {
  const v = readPref(key);
  return v === null ? true : v === 'true';
};

function loadPrefs(): Prefs {
  const server = readPref(SERVER_KEY);
  return {
    format: readPref(FORMAT_KEY) === 'dub' ? 'dub' : 'sub',
    server: isServerKey(server) ? server : DEFAULT_SERVER,
    subdef: readSubDefault(),
    autoplay: readBool(BOOL_KEYS.autoplay),
    autoskip: readBool(BOOL_KEYS.autoskip),
    autonext: readBool(BOOL_KEYS.autonext),
    skipfiller: readBool(BOOL_KEYS.skipfiller),
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Local data (everything AniZoro keeps lives in this browser)                                       */
/* ------------------------------------------------------------------------------------------------ */

const TRACKER_KEY = 'anime_tracker_list';
const RECENT_KEY = 'anime_recent_watch';
const SEARCH_KEY = 'anime_search_history';
const PROGRESS_KEY = 'anizoro_progress_v1';
const CACHE_PREFIXES = ['anizoro_anim_cache_', 'anizoro_fresh_', 'anizoro_ext_ids'];

interface LocalStats {
  watchlist: number;
  history: number;
  searches: number;
  cacheEntries: number;
  bytes: number;
}

const countJson = (key: string): number => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
  } catch {
    /* unreadable: counts as empty */
  }
  return 0;
};

const ownKeys = (): string[] => {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('anizoro_') || k.startsWith('anime_'))) out.push(k);
    }
  } catch {
    /* storage unavailable */
  }
  return out;
};

function readStats(): LocalStats {
  const keys = ownKeys();
  let bytes = 0;
  let cacheEntries = 0;
  try {
    for (const k of keys) {
      bytes += k.length + (localStorage.getItem(k) || '').length;
      if (CACHE_PREFIXES.some((p) => k.startsWith(p))) cacheEntries++;
    }
  } catch {
    /* ignore */
  }
  return {
    watchlist: countJson(TRACKER_KEY),
    history: countJson(RECENT_KEY),
    searches: countJson(SEARCH_KEY),
    cacheEntries,
    bytes: bytes * 2, // UTF-16
  };
}

const removeKeys = (keys: string[]) => {
  try {
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
};

const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

/* ------------------------------------------------------------------------------------------------ */
/* Small building blocks                                                                             */
/* ------------------------------------------------------------------------------------------------ */

const card = 'rounded-2xl bg-white/[0.045] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]';
const btnGhost =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-200 bg-white/[0.06] border border-white/10 hover:bg-white/[0.12] hover:border-white/20 transition-colors cursor-pointer';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[#0c0d0c] bg-[#3fcf8e] hover:bg-[#59dca3] transition-colors cursor-pointer';
const btnDanger =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 transition-colors cursor-pointer';

function PageHeader({
  icon: Icon,
  title,
  subtitle,
  meta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  meta?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 pb-5 border-b border-white/10">
      <div className="flex items-start gap-3.5 min-w-0">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-[#3fcf8e]/10 border border-[#3fcf8e]/25 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#7fe0b2]" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-xl font-bold text-white tracking-tight leading-tight">{title}</h3>
          <p className="text-[13px] text-zinc-400 mt-1 leading-relaxed">{subtitle}</p>
        </div>
      </div>
      {meta && <div className="shrink-0 hidden sm:block">{meta}</div>}
    </header>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10 text-[11px] font-mono font-semibold text-zinc-300 whitespace-nowrap">
      {children}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 shrink-0 rounded-full border transition-colors cursor-pointer ${
        checked ? 'bg-[#3fcf8e] border-[#3fcf8e]/60' : 'bg-white/10 border-white/15'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-transform ${
          checked ? 'translate-x-5 bg-[#04120d]' : 'bg-white'
        }`}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      {control}
    </div>
  );
}

function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'ok'; title: string; children: React.ReactNode }) {
  const color = tone === 'ok' ? 'border-[#3fcf8e]/30 bg-[#3fcf8e]/[0.07]' : 'border-white/12 bg-white/[0.04]';
  return (
    <div className={`rounded-2xl border ${color} p-4 flex gap-3`}>
      <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${tone === 'ok' ? 'text-[#3fcf8e]' : 'text-zinc-400'}`} />
      <div className="space-y-1 min-w-0">
        <p className="text-[13px] font-semibold text-white">{title}</p>
        <div className="text-[13px] text-zinc-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/** A numbered clause of a legal document. */
function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="font-display text-[15px] font-bold text-white flex items-baseline gap-2.5">
        <span className="text-[11px] font-mono font-bold text-[#3fcf8e]">{String(n).padStart(2, '0')}</span>
        <span>{title}</span>
      </h4>
      <div className="text-[13px] text-zinc-300 leading-relaxed space-y-2 pl-[26px]">{children}</div>
    </section>
  );
}

const CopyButton = ({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: (t: string) => void }) => (
  <button
    type="button"
    onClick={() => onCopy(text)}
    className="p-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-zinc-200 transition-colors cursor-pointer"
    title="Copy email"
    aria-label={`Copy ${text}`}
  >
    {copied ? <Check className="w-3.5 h-3.5 text-[#3fcf8e]" /> : <Copy className="w-3.5 h-3.5" />}
  </button>
);

/* ------------------------------------------------------------------------------------------------ */
/* Navigation                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

type Icon = React.ComponentType<{ className?: string }>;
const NAV: { label: string; items: { id: InfoModalTab; label: string; icon: Icon }[] }[] = [
  {
    label: 'Preferences',
    items: [
      { id: 'settings', label: 'Playback', icon: SlidersHorizontal },
      { id: 'data', label: 'Data & storage', icon: Database },
    ],
  },
  {
    label: 'Legal',
    items: [
      { id: 'terms', label: 'Terms of Service', icon: FileText },
      { id: 'privacy', label: 'Privacy Policy', icon: Lock },
      { id: 'dmca', label: 'DMCA & Copyright', icon: Scale },
    ],
  },
  {
    label: 'Help',
    items: [
      { id: 'about', label: 'About', icon: Info },
      { id: 'faq', label: 'FAQ', icon: HelpCircle },
      { id: 'contact', label: 'Contact', icon: LifeBuoy },
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'Does AniZoro host or store any video files?',
    a: 'No. AniZoro is a catalog and discovery service. We do not upload, host, encode or store video. Streams are provided by independent third-party services and played through embedded players.',
  },
  {
    q: 'How do I switch between sub and dub?',
    a: 'Use the Sub / Dub switch under the video player. You can also choose a default in Preferences. If a dub is not available for an episode or server, the player falls back to the subtitled version.',
  },
  {
    q: 'A video will not load or keeps buffering. What should I do?',
    a: 'Streams come from independent servers, so one can be slow or down while another works. Try a different server (Vidstream 1, Vidstream 2, Vidstream 3 or HD 1) from the player. If none work, send us a report from the Contact page with the title and episode.',
  },
  {
    q: 'Where are my watchlist and watch progress saved?',
    a: 'On this device, in your browser. There are no accounts, so nothing is synced to a server. Clearing your browser data, using a different browser or switching devices means starting fresh. You can see exactly what is stored in Preferences, under Data & storage.',
  },
  {
    q: 'How do I report copyright infringement?',
    a: 'Open the DMCA & Copyright page for the notice requirements and our designated contacts. Send formal notices by email and include the exact URLs of the material in question.',
  },
  {
    q: 'Is AniZoro free?',
    a: 'Yes. There are no subscriptions or paywalls.',
  },
];

/* ------------------------------------------------------------------------------------------------ */
/* Main component                                                                                    */
/* ------------------------------------------------------------------------------------------------ */

export default function InfoModals({ isOpen, initialTab = 'about', onClose }: InfoModalsProps) {
  const [activeTab, setActiveTab] = useState<InfoModalTab>(initialTab);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // preferences
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  // data & storage
  const [stats, setStats] = useState<LocalStats>(() => readStats());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [dataNotice, setDataNotice] = useState<string | null>(null);

  // contact form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('General feedback');
  const [contactMessage, setContactMessage] = useState('');
  const [messageSent, setMessageSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setPrefs(loadPrefs());
      setStats(readStats());
      setPendingAction(null);
      setDataNotice(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setPendingAction(null);
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1600);
  }, []);

  const setBool = (name: keyof typeof BOOL_KEYS, value: boolean) => {
    setPrefs((p) => ({ ...p, [name]: value }));
    writePref(BOOL_KEYS[name], String(value));
    flashSaved();
  };
  const setFormat = (format: 'sub' | 'dub') => {
    setPrefs((p) => ({ ...p, format }));
    writePref(FORMAT_KEY, format);
    flashSaved();
  };
  const setServer = (server: string) => {
    setPrefs((p) => ({ ...p, server }));
    writePref(SERVER_KEY, server);
    flashSaved();
  };
  const setSubDef = (subdef: SubDefault) => {
    setPrefs((p) => ({ ...p, subdef }));
    writePref(SUB_DEFAULT_KEY, subdef);
    removeKeys([SUB_LANG_KEY]); // a language picked inside the player no longer overrides the new default
    flashSaved();
  };
  const resetPrefs = () => {
    removeKeys([...Object.values(BOOL_KEYS), FORMAT_KEY, SERVER_KEY, SUB_DEFAULT_KEY, SUB_LANG_KEY]);
    setPrefs(loadPrefs());
    setPendingAction(null);
    flashSaved();
  };

  const handleCopy = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(text);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const finishDestructive = (message: string) => {
    setDataNotice(message);
    setStats(readStats());
    setPendingAction(null);
    // the app keeps these lists in memory, so reload to show the cleared state everywhere
    window.setTimeout(() => window.location.reload(), 900);
  };

  const runDataAction = (id: string) => {
    if (id === 'cache') {
      removeKeys(ownKeys().filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p))));
      setStats(readStats());
      setDataNotice('Cached data cleared. It will be fetched again when needed.');
      setPendingAction(null);
    } else if (id === 'searches') {
      removeKeys([SEARCH_KEY, 'anizoro_cached_searches']);
      finishDestructive('Search history cleared.');
    } else if (id === 'history') {
      removeKeys([RECENT_KEY, PROGRESS_KEY]);
      finishDestructive('Watch history cleared.');
    } else if (id === 'all') {
      removeKeys(ownKeys());
      finishDestructive('All local data deleted.');
    } else if (id === 'prefs') {
      resetPrefs();
    }
  };

  const handleSendContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactMessage.trim()) return;
    const mailtoUrl = `mailto:${CONTACT_EMAILS[0]}?cc=${CONTACT_EMAILS[1]}&subject=${encodeURIComponent(
      `[AniZoro] ${contactSubject}${contactName ? ` - ${contactName}` : ''}`
    )}&body=${encodeURIComponent(`Name: ${contactName}\nEmail: ${contactEmail}\n\n${contactMessage}`)}`;
    window.location.href = mailtoUrl;
    setMessageSent(true);
    window.setTimeout(() => {
      setMessageSent(false);
      setContactMessage('');
    }, 3000);
  };

  /** Two-step button: the first click asks, the second one does it. */
  const renderConfirm = (id: string, label: string, confirmLabel: string, danger = true, Icon: Icon = Trash2) =>
    pendingAction === id ? (
      <span className="inline-flex items-center gap-2">
        <button type="button" onClick={() => runDataAction(id)} className={danger ? btnDanger : btnPrimary}>
          <Check className="w-3.5 h-3.5" />
          <span>{confirmLabel}</span>
        </button>
        <button type="button" onClick={() => setPendingAction(null)} className={btnGhost}>
          Cancel
        </button>
      </span>
    ) : (
      <button type="button" onClick={() => setPendingAction(id)} className={danger ? btnDanger : btnGhost}>
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>
    );

  if (!isOpen) return null;

  const stat = (label: string, value: string) => (
    <div className={`${card} p-3.5`}>
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="text-lg font-display font-bold text-white mt-0.5">{value}</p>
    </div>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 select-none font-sans overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80"
        />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Legal and preferences"
          initial={{ scale: 0.96, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 14 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-5xl h-[88vh] max-h-[760px] frosted-glass-modal rounded-3xl overflow-hidden flex flex-col z-10 text-white"
        >
          {/* Header */}
          <div className="px-5 sm:px-6 py-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.03]">
            <div className="flex items-center gap-3 min-w-0">
              <AniZoroLogo size="sm" showSubtitle={false} />
              <div className="h-4 w-px bg-white/20 hidden sm:block" />
              <h2 className="font-display font-semibold text-sm sm:text-[15px] tracking-tight text-zinc-200 truncate">
                Preferences &amp; Legal
              </h2>
            </div>
            <div className="flex items-center gap-2.5">
              <AnimatePresence>
                {savedFlash && (
                  <motion.span
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#7fe0b2]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Saved
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {/* Navigation */}
            <nav
              aria-label="Sections"
              className="w-full md:w-60 shrink-0 bg-black/25 border-b md:border-b-0 md:border-r border-white/10 p-2.5 md:p-4 flex md:flex-col gap-1 md:gap-0.5 overflow-x-auto md:overflow-y-auto scrollbar-none"
            >
              {NAV.map((group, gi) => (
                <React.Fragment key={group.label}>
                  <p className={`hidden md:block px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5 ${gi === 0 ? '' : 'mt-4'}`}>
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setActiveTab(item.id)}
                        className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap text-left transition-colors cursor-pointer border ${
                          active
                            ? 'bg-[#3fcf8e]/[0.12] border-[#3fcf8e]/25 text-[#9ffbd6] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                            : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {active && <span className="hidden md:block absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-[#3fcf8e]" />}
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#3fcf8e]' : 'text-zinc-500'}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
              <div className="hidden md:flex mt-auto pt-4 items-center justify-between px-3 text-[11px] text-zinc-500">
                <span>AniZoro</span>
                <span className="font-mono text-zinc-400">{APP_VERSION}</span>
              </div>
            </nav>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto p-5 sm:p-8">
              <div className="max-w-2xl mx-auto space-y-6 text-sm">
                {/* ---------------------------------- PLAYBACK ---------------------------------- */}
                {activeTab === 'settings' && (
                  <>
                    <PageHeader
                      icon={SlidersHorizontal}
                      title="Playback preferences"
                      subtitle="Choose how episodes start and play. Changes save automatically and apply the next time a player opens."
                    />

                    <div className={`${card} p-5 space-y-4`}>
                      <div className="flex items-center gap-2.5">
                        <Languages className="w-4 h-4 text-[#3fcf8e]" />
                        <p className="text-sm font-semibold text-white">Default audio</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Default audio">
                        {([
                          ['sub', 'Subtitled', 'Original Japanese audio'],
                          ['dub', 'Dubbed', 'English audio, when available'],
                        ] as const).map(([id, name, hint]) => (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={prefs.format === id}
                            onClick={() => setFormat(id)}
                            className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                              prefs.format === id
                                ? 'bg-[#3fcf8e]/[0.12] border-[#3fcf8e]/40'
                                : 'bg-black/25 border-white/10 hover:border-white/25'
                            }`}
                          >
                            <p className={`text-sm font-semibold ${prefs.format === id ? 'text-[#9ffbd6]' : 'text-white'}`}>{name}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={`${card} p-5 space-y-4`}>
                      <div className="flex items-center gap-2.5">
                        <Server className="w-4 h-4 text-[#3fcf8e]" />
                        <p className="text-sm font-semibold text-white">Default server</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Default server">
                        {STREAM_SERVERS.map((srv) => {
                          const on = prefs.server === srv.key;
                          return (
                            <button
                              key={srv.key}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setServer(srv.key)}
                              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                                on ? 'bg-[#3fcf8e]/[0.12] border-[#3fcf8e]/40' : 'bg-black/25 border-white/10 hover:border-white/25'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm font-semibold ${on ? 'text-[#9ffbd6]' : 'text-white'}`}>{srv.name}</p>
                                {srv.key === DEFAULT_SERVER && (
                                  <span className="text-[10px] font-semibold text-[#3fcf8e] bg-[#3fcf8e]/10 border border-[#3fcf8e]/25 rounded-md px-1.5 py-0.5">
                                    Recommended
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5">{srv.dub ? 'Sub and dub' : 'Sub only'}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className={`${card} p-5 space-y-4`}>
                      <div className="flex items-center gap-2.5">
                        <Languages className="w-4 h-4 text-[#3fcf8e]" />
                        <p className="text-sm font-semibold text-white">Default subtitles</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Default subtitles">
                        {([
                          ['en', 'English', 'Dialogue only'],
                          ['en-sdh', 'English SDH', 'Adds sound descriptions'],
                          ['off', 'Off', 'Pick one in the player'],
                        ] as const).map(([id, name, hint]) => (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={prefs.subdef === id}
                            onClick={() => setSubDef(id)}
                            className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                              prefs.subdef === id
                                ? 'bg-[#3fcf8e]/[0.12] border-[#3fcf8e]/40'
                                : 'bg-black/25 border-white/10 hover:border-white/25'
                            }`}
                          >
                            <p className={`text-sm font-semibold ${prefs.subdef === id ? 'text-[#9ffbd6]' : 'text-white'}`}>{name}</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={`${card} p-5 divide-y divide-white/[0.07]`}>
                      <SettingRow
                        title="Autoplay"
                        description="Start playing as soon as an episode opens."
                        control={<Toggle checked={prefs.autoplay} onChange={(v) => setBool('autoplay', v)} label="Autoplay" />}
                      />
                      <SettingRow
                        title="Skip intro and outro"
                        description="Jump past openings and endings when the player detects them."
                        control={<Toggle checked={prefs.autoskip} onChange={(v) => setBool('autoskip', v)} label="Skip intro and outro" />}
                      />
                      <SettingRow
                        title="Play next episode"
                        description="Continue to the next episode when one finishes."
                        control={<Toggle checked={prefs.autonext} onChange={(v) => setBool('autonext', v)} label="Play next episode" />}
                      />
                      <SettingRow
                        title="Skip filler episodes"
                        description="Move past filler when choosing the next episode."
                        control={<Toggle checked={prefs.skipfiller} onChange={(v) => setBool('skipfiller', v)} label="Skip filler episodes" />}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-zinc-500">These are stored on this device only.</p>
                      {renderConfirm('prefs', 'Reset to defaults', 'Reset', false, RotateCcw)}
                    </div>
                  </>
                )}

                {/* ------------------------------- DATA & STORAGE ------------------------------- */}
                {activeTab === 'data' && (
                  <>
                    <PageHeader
                      icon={Database}
                      title="Data & storage"
                      subtitle="AniZoro has no accounts. Your watchlist, progress and settings live in this browser, and nowhere else."
                    />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {stat('Watchlist', String(stats.watchlist))}
                      {stat('Watch history', String(stats.history))}
                      {stat('Saved searches', String(stats.searches))}
                      {stat('Stored on device', formatBytes(stats.bytes))}
                    </div>

                    {dataNotice && (
                      <div className="rounded-xl border border-[#3fcf8e]/30 bg-[#3fcf8e]/[0.08] px-4 py-3 text-[13px] text-[#9ffbd6] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{dataNotice}</span>
                      </div>
                    )}

                    <div className={`${card} p-5 divide-y divide-white/[0.07]`}>
                      <SettingRow
                        title="Cached data"
                        description={`Posters, schedules and details kept for speed (${stats.cacheEntries} items). Safe to clear.`}
                        control={renderConfirm('cache', 'Clear cache', 'Clear', false)}
                      />
                      <SettingRow
                        title="Search history"
                        description="Recent searches shown in the search box."
                        control={renderConfirm('searches', 'Clear', 'Confirm')}
                      />
                      <SettingRow
                        title="Watch history"
                        description="Continue-watching entries and episode progress. Your watchlist is kept."
                        control={renderConfirm('history', 'Clear', 'Confirm')}
                      />
                    </div>

                    <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-5 flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">Delete all local data</p>
                        <p className="text-xs text-zinc-400 mt-0.5 max-w-sm leading-relaxed">
                          Removes the watchlist, history, searches, preferences and cache from this browser. This cannot be undone.
                        </p>
                      </div>
                      {renderConfirm('all', 'Delete everything', 'Yes, delete')}
                    </div>
                  </>
                )}

                {/* ------------------------------------ ABOUT ----------------------------------- */}
                {activeTab === 'about' && (
                  <>
                    <PageHeader
                      icon={Info}
                      title="About AniZoro"
                      subtitle="A fast, ad-light place to discover anime and keep track of what you watch."
                      meta={<Chip>{APP_VERSION}</Chip>}
                    />
                    <p className="text-[13px] text-zinc-300 leading-relaxed">
                      AniZoro brings trending lists, this season&apos;s releases and the weekly episode schedule into one clean interface, with a player
                      that remembers where you stopped. It is a catalog and discovery service: it does not host media.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        ['Always current', 'Trending, seasonal and schedule data come from AniList and MyAnimeList (via Jikan).'],
                        ['Sub and dub', 'Switch audio and servers from the player, with automatic fallback when a dub is missing.'],
                        ['Forgiving search', 'Short names like HxH or AOT and small typos still find the right title.'],
                        ['Private by design', 'No accounts and no tracking cookies. Your lists stay in your browser.'],
                      ].map(([t, d]) => (
                        <div key={t} className={`${card} p-4 space-y-1`}>
                          <p className="text-[13px] font-semibold text-white flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3fcf8e]" />
                            {t}
                          </p>
                          <p className="text-xs text-zinc-400 leading-relaxed">{d}</p>
                        </div>
                      ))}
                    </div>
                    <Callout title="Not affiliated">
                      AniZoro is an independent project. It is not affiliated with AniList, MyAnimeList, Kitsu or any streaming provider, and all titles,
                      artwork and trademarks belong to their respective owners.
                    </Callout>
                  </>
                )}

                {/* ------------------------------------ TERMS ----------------------------------- */}
                {activeTab === 'terms' && (
                  <>
                    <PageHeader
                      icon={FileText}
                      title="Terms of Service"
                      subtitle="The rules for using AniZoro."
                      meta={<Chip>Updated {LEGAL_UPDATED}</Chip>}
                    />
                    <Callout tone="ok" title="In short">
                      AniZoro is a free catalog and discovery service. We do not host video, content comes from third parties, and you use the site at
                      your own discretion and for personal, non-commercial purposes.
                    </Callout>
                    <div className="space-y-6">
                      <Clause n={1} title="Acceptance of these terms">
                        <p>
                          By accessing or using AniZoro you agree to these Terms. If you do not agree, please stop using the site. We may update the Terms
                          from time to time; continued use after a change means you accept the updated version.
                        </p>
                      </Clause>
                      <Clause n={2} title="What the service is">
                        <p>
                          AniZoro provides information about anime titles, release schedules and links to video players run by independent third parties. We
                          do not upload, host, store or control any video files, and we do not select the content those third parties provide.
                        </p>
                      </Clause>
                      <Clause n={3} title="Acceptable use">
                        <p>You agree not to:</p>
                        <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                          <li>use the site for any unlawful purpose or in a way that infringes the rights of others;</li>
                          <li>attempt to disrupt, overload or gain unauthorized access to the site or its infrastructure;</li>
                          <li>scrape, copy or resell the service at scale, or build competing services from it without permission;</li>
                          <li>circumvent technical limits, or interfere with other people&apos;s use of the site.</li>
                        </ul>
                      </Clause>
                      <Clause n={4} title="Third-party content and services">
                        <p>
                          Streams, embedded players, metadata and images are provided by third parties and are governed by their own terms and privacy
                          policies. We are not responsible for their availability, accuracy, advertising or conduct, and a link or embed is not an endorsement.
                        </p>
                      </Clause>
                      <Clause n={5} title="Intellectual property">
                        <p>
                          Anime titles, artwork, names and trademarks belong to their respective owners. The AniZoro name, logo and interface design belong
                          to the site&apos;s operators. Copyright concerns are handled under the DMCA &amp; Copyright policy.
                        </p>
                      </Clause>
                      <Clause n={6} title="Availability and changes">
                        <p>
                          The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We may change, suspend or discontinue any part
                          of it at any time, and we do not guarantee uninterrupted or error-free operation.
                        </p>
                      </Clause>
                      <Clause n={7} title="Disclaimer and limitation of liability">
                        <p>
                          To the fullest extent permitted by law, AniZoro and its operators make no warranties of any kind and are not liable for any
                          indirect, incidental or consequential damages, or for loss arising from your use of the site, third-party content or service
                          interruptions.
                        </p>
                      </Clause>
                      <Clause n={8} title="Contact">
                        <p>Questions about these Terms can be sent through the Contact page.</p>
                      </Clause>
                    </div>
                  </>
                )}

                {/* ----------------------------------- PRIVACY ---------------------------------- */}
                {activeTab === 'privacy' && (
                  <>
                    <PageHeader
                      icon={Lock}
                      title="Privacy Policy"
                      subtitle="What AniZoro collects, what stays on your device, and who else is involved."
                      meta={<Chip>Updated {LEGAL_UPDATED}</Chip>}
                    />
                    <Callout tone="ok" title="In short">
                      No accounts, no advertising or analytics cookies from us, and we do not sell your data. Your lists and settings are kept in your
                      browser and you can delete them at any time under Preferences.
                    </Callout>
                    <div className="space-y-6">
                      <Clause n={1} title="What we store, and where">
                        <p>
                          AniZoro does not ask you to register or sign in. To work properly it saves the following in your browser&apos;s local storage:
                          your watchlist, watch progress and history, recent searches, your playback preferences, and cached catalog data used to load
                          pages faster. This information stays on your device and is not sent to our servers.
                        </p>
                      </Clause>
                      <Clause n={2} title="Information processed when you visit">
                        <p>
                          Like any website, our hosting provider (Cloudflare) processes technical data such as your IP address, browser type and request
                          details to deliver the site, prevent abuse and keep it secure. Some catalog requests pass through our own edge service so that
                          responses can be cached; we do not use them to profile visitors.
                        </p>
                      </Clause>
                      <Clause n={3} title="Third parties">
                        <p>
                          Catalog data is loaded from AniList, Jikan (MyAnimeList) and Kitsu. Video is played from independent providers through embedded
                          players. When you load or watch their content, those services may receive your IP address and device information and may set
                          their own cookies under their own policies. We do not control them.
                        </p>
                      </Clause>
                      <Clause n={4} title="Cookies and local storage">
                        <p>
                          We use local storage, not tracking cookies, to remember your choices. Embedded players from third parties may use cookies. You can
                          block or clear them in your browser settings.
                        </p>
                      </Clause>
                      <Clause n={5} title="We do not sell your data">
                        <p>We do not sell, rent or trade personal information, and we do not run advertising profiles.</p>
                      </Clause>
                      <Clause n={6} title="Your choices">
                        <p>
                          You can view and delete everything AniZoro stores under Preferences &rarr; Data &amp; storage, or by clearing this site&apos;s data
                          in your browser. Because nothing is held on our side, deleting it locally removes it entirely.
                        </p>
                      </Clause>
                      <Clause n={7} title="Children">
                        <p>AniZoro is not directed at children under 13 and we do not knowingly collect personal information from them.</p>
                      </Clause>
                      <Clause n={8} title="Changes and contact">
                        <p>
                          We may update this policy and will change the date above when we do. Privacy questions can be sent through the Contact page.
                        </p>
                      </Clause>
                    </div>
                  </>
                )}

                {/* ------------------------------------ DMCA ------------------------------------ */}
                {activeTab === 'dmca' && (
                  <>
                    <PageHeader
                      icon={Scale}
                      title="DMCA & Copyright"
                      subtitle="How to report content you believe infringes your copyright."
                      meta={
                        <a href={DMCA_POLICY_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                          <span>Official policy</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      }
                    />
                    <Callout tone="ok" title="We do not host video">
                      AniZoro does not upload, store or transmit video files. Links and players point to material hosted by independent third parties. We
                      respond to valid notices by removing or disabling the relevant links.
                    </Callout>

                    <div className="space-y-3">
                      <h4 className="font-display text-[15px] font-bold text-white">What to include in a notice</h4>
                      <ol className="space-y-2.5">
                        {[
                          'Your physical or electronic signature, as the copyright owner or an authorized agent.',
                          'A description of the copyrighted work you claim has been infringed.',
                          'The exact URL(s) on AniZoro where the material you object to can be found.',
                          'Your name, mailing address, telephone number and email address.',
                          'A statement that you have a good-faith belief the use is not authorized by the owner, its agent or the law.',
                          'A statement, under penalty of perjury, that the information is accurate and that you are authorized to act for the owner.',
                        ].map((t, i) => (
                          <li key={i} className="flex gap-3 text-[13px] text-zinc-300 leading-relaxed">
                            <span className="w-5 h-5 shrink-0 rounded-md bg-white/[0.07] border border-white/10 text-[11px] font-mono font-bold text-[#3fcf8e] flex items-center justify-center mt-0.5">
                              {i + 1}
                            </span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className={`${card} p-5 space-y-3`}>
                      <p className="text-sm font-semibold text-white">Designated copyright contacts</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CONTACT_EMAILS.map((email) => (
                          <div key={email} className="flex items-center justify-between gap-2 p-2.5 pl-3.5 rounded-xl bg-black/30 border border-white/10">
                            <span className="font-mono text-xs text-zinc-200 truncate">{email}</span>
                            <CopyButton text={email} copied={copied === email} onCopy={handleCopy} />
                          </div>
                        ))}
                      </div>
                      <a
                        href={`mailto:${CONTACT_EMAILS[0]}?cc=${CONTACT_EMAILS[1]}&subject=${encodeURIComponent('[DMCA Takedown Notice] AniZoro')}&body=${encodeURIComponent('To AniZoro Copyright Agent:\n\n1. Copyrighted Work: \n2. Infringing URL(s) on AniZoro: \n3. My Contact Information: \n4. Statement of Good Faith: \n5. Electronic Signature: ')}`}
                        className={`${btnPrimary} w-full`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Prepare a notice by email</span>
                      </a>
                    </div>

                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Knowingly submitting a false notice may carry legal liability. Our full policy is also published at{' '}
                      <a href={DMCA_POLICY_URL} target="_blank" rel="noopener noreferrer" className="text-[#7fe0b2] hover:underline">
                        websitepolicies.com
                      </a>
                      .
                    </p>
                  </>
                )}

                {/* ------------------------------------- FAQ ------------------------------------ */}
                {activeTab === 'faq' && (
                  <>
                    <PageHeader icon={HelpCircle} title="Frequently asked questions" subtitle="Quick answers about playback, servers and your data." />
                    <div className="space-y-2.5">
                      {FAQ_ITEMS.map((item, idx) => {
                        const open = expandedFaq === idx;
                        return (
                          <div key={item.q} className={`${card} overflow-hidden`}>
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setExpandedFaq(open ? null : idx)}
                              className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 text-[13px] font-semibold text-white cursor-pointer hover:bg-white/[0.04] transition-colors"
                            >
                              <span>{item.q}</span>
                              <ChevronDown className={`w-4 h-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180 text-[#3fcf8e]' : ''}`} />
                            </button>
                            {open && <div className="px-4 pb-4 pt-0.5 text-[13px] text-zinc-300 leading-relaxed">{item.a}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ----------------------------------- CONTACT ---------------------------------- */}
                {activeTab === 'contact' && (
                  <>
                    <PageHeader icon={LifeBuoy} title="Contact" subtitle="Questions, broken episodes, title requests or feedback. We read everything." />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {CONTACT_EMAILS.map((email) => (
                        <div key={email} className={`${card} p-3.5 flex items-center justify-between gap-2`}>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-zinc-500">Email</p>
                            <p className="font-mono text-xs text-white truncate">{email}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <CopyButton text={email} copied={copied === email} onCopy={handleCopy} />
                            <a
                              href={`mailto:${email}`}
                              className="p-2 rounded-lg bg-[#3fcf8e] text-[#04120d] hover:bg-[#4aecb0] transition-colors cursor-pointer"
                              title="Send email"
                              aria-label={`Email ${email}`}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleSendContact} className={`${card} p-5 space-y-4`}>
                      <p className="text-sm font-semibold text-white">Send a message</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-[11px] font-medium text-zinc-400 block mb-1">Name</span>
                          <input
                            type="text"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            placeholder="Your name"
                            className="frosted-glass-input w-full px-3.5 py-2.5 rounded-xl text-white text-xs placeholder:text-zinc-600 focus:border-[#3fcf8e]/60 focus:outline-none"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-medium text-zinc-400 block mb-1">Email</span>
                          <input
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="frosted-glass-input w-full px-3.5 py-2.5 rounded-xl text-white text-xs placeholder:text-zinc-600 focus:border-[#3fcf8e]/60 focus:outline-none"
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-[11px] font-medium text-zinc-400 block mb-1">Topic</span>
                        <select
                          value={contactSubject}
                          onChange={(e) => setContactSubject(e.target.value)}
                          className="frosted-glass-input w-full px-3.5 py-2.5 rounded-xl text-white text-xs focus:border-[#3fcf8e]/60 focus:outline-none cursor-pointer"
                        >
                          <option value="General feedback">General feedback</option>
                          <option value="Broken stream report">Broken stream or player issue</option>
                          <option value="Title request">Title request</option>
                          <option value="Copyright question">Copyright question</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-medium text-zinc-400 block mb-1">Message</span>
                        <textarea
                          rows={4}
                          value={contactMessage}
                          onChange={(e) => setContactMessage(e.target.value)}
                          placeholder="For broken episodes, include the title, episode number and server."
                          required
                          className="frosted-glass-input w-full px-3.5 py-2.5 rounded-xl text-white text-xs placeholder:text-zinc-600 focus:border-[#3fcf8e]/60 focus:outline-none resize-none"
                        />
                      </label>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-[11px] text-zinc-500">Opens your email app with the message ready to send.</span>
                        <button type="submit" className={btnPrimary}>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send message</span>
                        </button>
                      </div>
                      {messageSent && (
                        <div className="rounded-xl border border-[#3fcf8e]/30 bg-[#3fcf8e]/[0.08] px-4 py-3 text-[13px] text-[#9ffbd6] flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Opening your email app.</span>
                        </div>
                      )}
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
