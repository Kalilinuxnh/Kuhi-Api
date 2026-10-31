// Vidstream 1's player: Video.js v10 with a custom skin that follows the MegaPlay look
// (centered play/pause, -10 / +10, CC menu, settings gear, PiP, fullscreen, yellow intro/outro marks on the seek bar).
// It is loaded lazily by DirectPlayer, which owns source resolving and fallback; this file only plays one URL.
//
// Performance: every piece below subscribes to just the state it shows (the clock re-renders once per second,
// not on every timeupdate) and is memoised. Play/pause, seek and mute act directly on the <video> element,
// so they keep working whatever state the library's own buttons are in.
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Container,
  Controls,
  Hotkey,
  StatusAnnouncer,
  TimeSlider,
  useCaptionsOptions,
  usePlaybackRateOptions,
  useQualityOptions,
} from '@videojs/react';
import { Video, VideoPlayer, usePlayer } from '@videojs/react/video';
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video';
import {
  IconBack10,
  IconCC,
  IconCast,
  IconEnterFullscreen,
  IconExitFullscreen,
  IconForward10,
  IconGear,
  IconMuted,
  IconPause,
  IconPip,
  IconPlay,
  IconVolume,
} from './directIcons';
import './direct-skin.css';

export interface StageTrack {
  src: string;
  label: string;
  lang: string;
  isDefault: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface VjsStageProps {
  url: string;
  kind: 'hls' | 'file';
  title: string;
  tracks: StageTrack[];
  intro?: TimeRange;
  outro?: TimeRange;
  autoPlay: boolean;
  autoSkip: boolean;
  /** seconds to jump to once playable (used when a failed source is replaced mid-episode) */
  resumeAt: number;
  /** episode id used to remember the playhead between visits (omit to disable) */
  progressId?: string;
  /** kept up to date with the playhead so the caller can resume after a switch */
  timeRef: React.MutableRefObject<number>;
  onLoaded: () => void;
  onPlaying: () => void;
  onEnded: () => void;
  onFail: (reason: string) => void;
}

const fmt = (t: number) => {
  const sec = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
};

const CUE_SIZES = [
  { value: 'small', label: 'Small', size: '0.85em' },
  { value: 'medium', label: 'Medium', size: '1.05em' },
  { value: 'large', label: 'Large', size: '1.35em' },
];
import { clearProgress, saveProgress } from '../lib/progress';
import { SUB_LANG_KEY, readPlayerPrefs, readPref, writePlayerPrefs, writePref } from '../lib/prefs';

const CUE_KEY = 'anizoro_cue_size';

function readCueSize(): string {
  try {
    const v = localStorage.getItem(CUE_KEY);
    if (CUE_SIZES.some((c) => c.value === v)) return v as string;
  } catch {
    /* storage unavailable */
  }
  return 'medium';
}

/** The real <video> element inside this player (found from our own markup, so no ref forwarding is needed). */
function useVideoElement(anchor: React.RefObject<HTMLElement | null>) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const find = () => {
      const v = anchor.current?.closest('.az-skin')?.querySelector('video') as HTMLVideoElement | null | undefined;
      if (v) setEl(v);
      else if (alive && tries++ < 60) setTimeout(find, 100);
    };
    find();
    return () => {
      alive = false;
    };
  }, [anchor]);
  return el;
}

/** paused / muted straight from the element's own events */
function useElementState(video: HTMLVideoElement | null) {
  const [state, setState] = useState({ paused: true, muted: false, buffering: false });
  useEffect(() => {
    if (!video) return;
    const sync = () =>
      setState((p) => (p.paused === video.paused && p.muted === video.muted ? p : { ...p, paused: video.paused, muted: video.muted }));
    const wait = () => setState((p) => (p.buffering ? p : { ...p, buffering: true }));
    const ready = () => setState((p) => (p.buffering ? { ...p, buffering: false } : p));
    sync();
    const events: Array<[string, () => void]> = [
      ['play', sync], ['pause', sync], ['playing', () => { sync(); ready(); }], ['ended', sync],
      ['volumechange', sync], ['emptied', sync], ['waiting', wait], ['canplay', ready], ['seeked', ready],
    ];
    events.forEach(([e, f]) => video.addEventListener(e, f));
    return () => events.forEach(([e, f]) => video.removeEventListener(e, f));
  }, [video]);
  return state;
}

/**
 * A small self-contained menu for the CC and gear buttons. It sits right above its button inside the control bar
 * (plain absolute positioning), so it cannot be clipped or mis-placed by the player's containment, and it does not
 * depend on the library's beta Menu. `data-open` keeps the control bar visible while a menu is open.
 */
function ControlMenu({ label, icon, btnClass = 'az-btn', on, children }: { label: string; icon: React.ReactNode; btnClass?: string; on?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} className="az-menu-wrap" data-open={open ? '' : undefined} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className={btnClass} aria-label={label} aria-haspopup="menu" aria-expanded={open} data-on={on ? '' : undefined} onClick={() => setOpen((o) => !o)}>
        {icon}
      </button>
      {open && (
        <div className="az-menu" role="menu" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function Group({ title, group }: { title: string; group: any }) {
  if (!group || group.state?.availability === 'unavailable' || !group.options?.length) return null;
  return (
    <div className="az-menu-group" role="group" aria-label={title}>
      <div className="az-menu-title">{title}</div>
      {group.options.map((option: any) => {
        const checked = option.value === group.value;
        return (
          <button key={String(option.value)} type="button" role="menuitemradio" aria-checked={checked} disabled={option.disabled} className="az-menu-item" onClick={() => group.setValue(option.value)}>
            <span>{option.label}</span>
            <span className="az-menu-check" data-checked={checked ? '' : undefined} />
          </button>
        );
      })}
    </div>
  );
}

/** Gear: quality and speed (like MegaPlay) */
const SettingsMenu = memo(function SettingsMenu() {
  const quality = useQualityOptions();
  const rate = usePlaybackRateOptions();
  return (
    <ControlMenu label="Settings" icon={<IconGear />}>
      <Group title="Quality" group={quality} />
      <Group title="Speed" group={rate} />
    </ControlMenu>
  );
});

/** CC: pick a subtitle language (or Off) and the text size */
const CaptionsMenu = memo(function CaptionsMenu({ defaultLabel }: { defaultLabel?: string }) {
  const captions = useCaptionsOptions();
  const showing = usePlayer((st: any) => Boolean(st.subtitlesShowing));
  const [cueSize, setCueSize] = useState(readCueSize);

  // subtitle text size (read by the ::cue rule in the stylesheet)
  useEffect(() => {
    const size = CUE_SIZES.find((c) => c.value === cueSize)?.size ?? '1.05em';
    document.documentElement.style.setProperty('--az-cue-size', size);
    try {
      localStorage.setItem(CUE_KEY, cueSize);
    } catch {
      /* storage unavailable */
    }
  }, [cueSize]);
  useEffect(() => () => document.documentElement.style.removeProperty('--az-cue-size'), []);

  // Which subtitle starts selected: the language the viewer picked last time (matched by name, track ids differ per
  // episode), otherwise the default of the page (English or English SDH, see Settings). Tracks arrive in batches,
  // so this runs again as new ones show up until the wanted one exists.
  const available = captions?.state?.availability === 'available';
  const optionKey = (captions?.options || []).map((o: any) => String(o.label)).join('|');
  const appliedRef = useRef(false);
  const pickedRef = useRef(false);
  useEffect(() => {
    if (!available || appliedRef.current || pickedRef.current) return;
    const saved = readPref(SUB_LANG_KEY);
    const wanted = saved || defaultLabel;
    if (!wanted) return;
    const hit = captions.options?.find((o: any) => String(o.label).toLowerCase() === wanted.toLowerCase());
    if (!hit) return;
    appliedRef.current = true;
    if (hit.value !== captions.value) {
      try {
        captions.setValue(hit.value);
      } catch {
        /* keep the default track */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, optionKey, defaultLabel]);

  if (!captions || !(available || captions.options?.length)) return null;
  const rememberLang = (value: string) => {
    pickedRef.current = true;
    captions.setValue(value);
    const picked = captions.options?.find((o: any) => o.value === value);
    if (picked) writePref(SUB_LANG_KEY, String(picked.label));
  };
  const captionGroup = { value: captions.value, setValue: rememberLang, options: captions.options, state: captions.state };
  const sizeGroup = { value: cueSize, setValue: setCueSize, options: CUE_SIZES.map((c) => ({ value: c.value, label: c.label })) };
  return (
    <ControlMenu label="Subtitles" icon={<IconCC />} btnClass="az-btn az-cc" on={showing}>
      <Group title="Subtitles" group={captionGroup} />
      <Group title="Text size" group={sizeGroup} />
    </ControlMenu>
  );
});

/** Clock: re-renders once per second */
const TimeText = memo(function TimeText() {
  const t = usePlayer((st: any) => Math.floor(st.currentTime || 0));
  const d = usePlayer((st: any) => Math.floor(st.duration || 0));
  return (
    <span className="az-time" aria-label="Current time and duration">
      {fmt(t)} <i>/</i> {fmt(d)}
    </span>
  );
});

/** Yellow intro / outro marks on the seek bar */
const Marks = memo(function Marks({ intro, outro }: { intro?: TimeRange; outro?: TimeRange }) {
  const duration = usePlayer((st: any) => Math.floor(st.duration || 0));
  if (!duration) return null;
  const mark = (r?: TimeRange) =>
    r && r.end > r.start ? (
      <span className="az-mark" style={{ left: `${(r.start / duration) * 100}%`, width: `${((r.end - r.start) / duration) * 100}%` }} />
    ) : null;
  return (
    <>
      {mark(intro)}
      {mark(outro)}
    </>
  );
});

/**
 * No UI of its own except the Skip button. Everything time-based runs off the <video> element's own events,
 * so this component only re-renders when the intro / outro zone changes (not once per second).
 *  - autoplay: starts the video once it can play; if the browser refuses sound, it starts muted instead
 *  - auto skip: jumps over the intro once per episode
 *  - auto next: reports the end of the video
 *  - failure reporting and resuming after a source switch
 */
type StageBehaviour = Pick<VjsStageProps, 'intro' | 'outro' | 'autoPlay' | 'autoSkip' | 'resumeAt' | 'progressId' | 'timeRef' | 'onFail' | 'onEnded'>;
type ChromeProps = StageBehaviour & { defaultLabel?: string };

const Behaviour = memo(function Behaviour({ intro, outro, autoPlay, autoSkip, resumeAt, progressId, timeRef, onFail, onEnded, video }: StageBehaviour & { video: HTMLVideoElement | null }) {
  const canPlay = usePlayer((st: any) => Boolean(st.canPlay));
  const error = usePlayer((st: any) => st.error);
  const [zone, setZone] = useState<'intro' | 'outro' | null>(null);
  const resumedRef = useRef(false);
  // set while the player muted itself to get past the autoplay block, so that is not saved as the viewer's choice
  const autoMutedRef = useRef(false);

  // live values, so flipping a switch takes effect without restarting the video
  const autoSkipRef = useRef(autoSkip);
  autoSkipRef.current = autoSkip;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // the player reports engine / network failures through its error state
  useEffect(() => {
    if (error) onFail(String(error.message || `playback error ${error.code ?? ''}`).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // continue where the previous source stopped
  useEffect(() => {
    if (!canPlay || resumedRef.current || !video) return;
    resumedRef.current = true;
    if (resumeAt > 5) video.currentTime = Math.max(0, resumeAt - 3); // a few seconds back for context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, video]);

  // viewer preferences: volume, mute and speed are restored for every episode and saved when changed
  useEffect(() => {
    if (!video) return;
    const prefs = readPlayerPrefs();
    video.volume = prefs.volume;
    video.muted = prefs.muted;
    const applyRate = () => {
      if (video.playbackRate !== prefs.rate) video.playbackRate = prefs.rate;
    };
    applyRate();
    video.addEventListener('loadedmetadata', applyRate);
    // engines reset the speed while a source loads: only changes after that settle count as the viewer's choice
    let listening = false;
    const arm = setTimeout(() => (listening = true), 2500);
    const onVolume = () => {
      if (autoMutedRef.current && video.muted) return;
      autoMutedRef.current = false;
      writePlayerPrefs({ volume: video.volume, muted: video.muted });
    };
    const onRate = () => {
      if (listening) writePlayerPrefs({ rate: video.playbackRate });
    };
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('ratechange', onRate);
    return () => {
      clearTimeout(arm);
      video.removeEventListener('loadedmetadata', applyRate);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('ratechange', onRate);
    };
  }, [video]);

  // remember where the viewer stopped (saved every few seconds, on pause, and when the page is hidden or closed)
  useEffect(() => {
    if (!video || !progressId) return;
    let last = 0;
    const save = () => saveProgress(progressId, video.currentTime, video.duration);
    const onTime = () => {
      const now = Date.now();
      if (now - last >= 5000) {
        last = now;
        save();
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    const onEnd = () => clearProgress(progressId);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('pause', save);
    video.addEventListener('ended', onEnd);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('pause', save);
      video.removeEventListener('ended', onEnd);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [video, progressId]);

  // autoplay (the HTML attribute alone is unreliable with HLS and is blocked by browsers when the sound is on)
  useEffect(() => {
    if (!video || !autoPlay) return;
    let done = false;
    const detach = () => {
      video.removeEventListener('loadeddata', attempt);
      video.removeEventListener('canplay', attempt);
    };
    function attempt() {
      if (done) return;
      if (!video!.paused) {
        done = true;
        detach();
        return;
      }
      video!
        .play()
        .then(() => {
          done = true;
          detach();
        })
        .catch((err: any) => {
          if (err?.name !== 'NotAllowedError') return;
          // blocked because of the sound: muted playback is always allowed (the speaker button turns it back on)
          autoMutedRef.current = true;
          video!.muted = true;
          video!
            .play()
            .then(() => {
              done = true;
              detach();
            })
            .catch(() => {});
        });
    }
    video.addEventListener('loadeddata', attempt);
    video.addEventListener('canplay', attempt);
    if (video.readyState >= 3) attempt();
    return detach;
  }, [video, autoPlay]);

  // playhead, intro / outro zones, auto skip
  useEffect(() => {
    if (!video) return;
    let skipped = false;
    let last: 'intro' | 'outro' | null = null;
    const onTime = () => {
      const t = video.currentTime;
      timeRef.current = t;
      let z: 'intro' | 'outro' | null = null;
      if (intro && t >= intro.start && t < intro.end - 1) z = 'intro';
      else if (outro && t >= outro.start && t < outro.end - 1) z = 'outro';
      if (z === 'intro' && intro && autoSkipRef.current && !skipped) {
        skipped = true;
        video.currentTime = intro.end;
        z = null;
      }
      if (z !== last) {
        last = z;
        setZone(z);
      }
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onTime);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onTime);
    };
  }, [video, intro, outro, timeRef]);

  // end of the video (Auto Next lives in the page; it gets the event from here)
  useEffect(() => {
    if (!video) return;
    const ended = () => onEndedRef.current();
    video.addEventListener('ended', ended);
    return () => video.removeEventListener('ended', ended);
  }, [video]);

  if (!zone) return null;
  return (
    <button
      type="button"
      className="az-skip"
      onClick={() => {
        if (video) video.currentTime = zone === 'intro' ? intro!.end : outro!.end;
      }}
    >
      {zone === 'intro' ? 'Skip Intro' : 'Skip Outro'}
    </button>
  );
});

function Chrome(props: ChromeProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const video = useVideoElement(anchorRef);
  const { paused, muted, buffering } = useElementState(video);
  const store: any = usePlayer();
  const visible = usePlayer((st: any) => Boolean(st.controlsVisible));
  const pip = usePlayer((st: any) => st.pictureInPictureAvailability);
  const cast = usePlayer((st: any) => st.remotePlaybackAvailability);
  const fullscreen = usePlayer((st: any) => Boolean(st.isFullscreen));
  const isPip = usePlayer((st: any) => Boolean(st.isPictureInPicture));

  const toggle = useCallback(() => {
    if (!video) return;
    if (video.paused || video.ended) video.play().catch(() => {});
    else video.pause();
  }, [video]);

  const seekBy = useCallback(
    (delta: number) => {
      if (!video) return;
      const max = Number.isFinite(video.duration) ? video.duration : Infinity;
      video.currentTime = Math.max(0, Math.min(max, video.currentTime + delta));
    },
    [video]
  );

  const idle = visible ? '' : ' az-idle';

  return (
    <>
      <div ref={anchorRef} className="az-anchor" aria-hidden="true" />

      {/* The picture itself only wakes the controls; play / pause lives on the button in the middle (and Space) */}
      <div className="az-surface" onClick={() => store.toggleControls?.(true)} />

      <div className={`az-center${idle}${buffering && !paused ? ' az-busy' : ''}`}>
        {buffering && !paused && <div className="az-spin" aria-label="Buffering" />}
        <button
          type="button"
          className="az-bigplay"
          data-paused={paused ? '' : undefined}
          aria-label={paused ? 'Play' : 'Pause'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <span key={paused ? 'p' : 'q'} className="az-pop">{paused ? <IconPlay /> : <IconPause />}</span>
        </button>
      </div>

      <Behaviour {...props} video={video} />

      <Controls.Root>
        <Controls.Content className={`az-controls${idle}`}>
          <TimeSlider.Root className="az-slider">
            <TimeSlider.Track className="az-track">
              <TimeSlider.Buffer className="az-buffer" />
              <TimeSlider.Fill className="az-fill" />
              <Marks intro={props.intro} outro={props.outro} />
            </TimeSlider.Track>
            <TimeSlider.Thumb className="az-thumb" />
          </TimeSlider.Root>

          <Controls.Group className="az-row" aria-label="Playback controls">
            <button
              type="button"
              className="az-btn az-vol"
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={() => {
                if (video) video.muted = !video.muted;
              }}
            >
              {muted ? <IconMuted /> : <IconVolume />}
            </button>
            <TimeText />

            <span className="az-spacer" />

            <button type="button" className="az-btn az-seek" aria-label="Back 10 seconds" onClick={() => seekBy(-10)}>
              <IconBack10 />
            </button>
            <button type="button" className="az-btn az-seek" aria-label="Forward 10 seconds" onClick={() => seekBy(10)}>
              <IconForward10 />
            </button>
            {cast === 'available' && (
              <button type="button" className="az-btn" aria-label="Cast" onClick={() => store.promptRemotePlayback()}>
                <IconCast />
              </button>
            )}
            <CaptionsMenu defaultLabel={props.defaultLabel} />
            <SettingsMenu />
            {pip === 'available' && (
              <button
                type="button"
                className="az-btn az-pip"
                aria-label="Picture in picture"
                onClick={() => (isPip ? store.exitPictureInPicture() : store.requestPictureInPicture())}
              >
                <IconPip />
              </button>
            )}
            <button
              type="button"
              className="az-btn"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={() => (fullscreen ? store.exitFullscreen() : store.requestFullscreen())}
            >
              {fullscreen ? <IconExitFullscreen /> : <IconEnterFullscreen />}
            </button>
          </Controls.Group>
        </Controls.Content>
      </Controls.Root>

      <Hotkey keys="Space" action="togglePaused" />
      <Hotkey keys="m" action="toggleMuted" />
      <Hotkey keys="f" action="toggleFullscreen" />
      <Hotkey keys="ArrowLeft" action="seekStep" value={-10} />
      <Hotkey keys="ArrowRight" action="seekStep" value={10} />
      <StatusAnnouncer />
    </>
  );
}

function VjsStage(props: VjsStageProps) {
  const { url, kind, title, tracks, intro, outro, autoPlay, autoSkip, resumeAt, progressId, timeRef, onLoaded, onPlaying, onEnded, onFail } = props;
  const Media: any = kind === 'hls' ? HlsJsVideo : Video;

  return (
    <VideoPlayer title={title}>
      <Container className="az-skin">
        <Media
          src={url}
          autoPlay={autoPlay}
          playsInline
          preload={kind === 'hls' ? 'auto' : 'metadata'}
          onLoadedData={onLoaded}
          onPlaying={onPlaying}
          onError={() => onFail('media error')}
        >
          {tracks.map((t, i) => (
            <track key={`${t.src}-${i}`} kind="subtitles" src={t.src} label={t.label} srcLang={t.lang} default={t.isDefault} />
          ))}
        </Media>
        <Chrome defaultLabel={tracks.find((t) => t.isDefault)?.label} intro={intro} outro={outro} autoPlay={autoPlay} autoSkip={autoSkip} resumeAt={resumeAt} progressId={progressId} timeRef={timeRef} onFail={onFail} onEnded={onEnded} />
      </Container>
    </VideoPlayer>
  );
}

export default memo(VjsStage);
