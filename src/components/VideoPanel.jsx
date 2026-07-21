import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutGrid,
  Maximize2,
  MicOff,
  Minimize2,
  VideoOff,
} from "lucide-react";

const SELF_ID = "__self__";
const SCREEN_ID = "__screen__";

function avatarColor(name = "") {
  const palette = [
    "bg-mint-500",
    "bg-coral-500",
    "bg-sky-500",
    "bg-purple-500",
    "bg-amber-500",
    "bg-navy-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[h];
}

function hasLiveVideoTrack(stream) {
  if (!stream?.getVideoTracks) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled !== false);
}

/**
 * 鏡頭關閉 / 無串流時的 Fallback（禁止純黑畫面）
 */
function CameraOffFallback({ name = "?", compact = false, label }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-navy-700 via-navy-900 to-[#0a1220]">
      <div
        className={`${
          compact ? "h-10 w-10 text-sm" : "h-24 w-24 sm:h-28 sm:w-28 text-3xl sm:text-4xl"
        } rounded-full ${avatarColor(name)} flex items-center justify-center text-white font-black shadow-lg ring-2 ring-white/15`}
      >
        {String(name || "?").slice(0, 1)}
      </div>
      {!compact && (
        <>
          <p className="mt-4 text-sm sm:text-base font-bold text-white tracking-wide">
            {label || name}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/70">
            <VideoOff className="h-3.5 w-3.5" strokeWidth={2.2} />
            鏡頭已關閉
          </span>
        </>
      )}
    </div>
  );
}

/**
 * 安全掛載父層 callback ref：避免 Gallery↔Focus 切換時
 * 「新 video 掛上 → 舊 video 卸載傳 null」把 ref 清掉導致黑畫面。
 */
function useSafeMediaRef(parentRef) {
  const elRef = useRef(null);
  const setNode = useCallback(
    (node) => {
      elRef.current = node;
      if (typeof parentRef === "function") {
        if (node) {
          parentRef(node);
        } else {
          queueMicrotask(() => {
            if (elRef.current == null) parentRef(null);
          });
        }
      } else if (parentRef && typeof parentRef === "object") {
        parentRef.current = node;
      }
    },
    [parentRef]
  );
  return [elRef, setNode];
}

function bindStreamToEl(el, stream, { mirror = false } = {}) {
  if (!el) return;
  if (stream) {
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.classList.toggle("scale-x-[-1]", mirror);
    const p = el.play();
    if (p?.catch) p.catch(() => {});
  }
}

/**
 * 本機鏡頭預覽：自行綁定 MediaStream，不依賴單一全域 remount 時序
 */
function LocalStreamVideo({
  parentRef,
  getStream,
  camOn,
  mediaReady,
  displayName,
  compact = false,
  objectFit = "cover",
}) {
  const [elRef, setNode] = useSafeMediaRef(parentRef);

  const rebind = useCallback(() => {
    const stream = typeof getStream === "function" ? getStream() : null;
    if (camOn && stream) bindStreamToEl(elRef.current, stream, { mirror: true });
  }, [camOn, getStream, elRef]);

  useEffect(() => {
    rebind();
    const t = window.setTimeout(rebind, 60);
    return () => window.clearTimeout(t);
  }, [rebind, camOn, mediaReady]);

  const stream = typeof getStream === "function" ? getStream() : null;
  const showFallback = !camOn || !hasLiveVideoTrack(stream);

  return (
    <>
      <video
        ref={setNode}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full scale-x-[-1] bg-navy-950 ${
          objectFit === "contain" ? "object-contain" : "object-cover"
        } ${showFallback ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      />
      {showFallback ? (
        <CameraOffFallback
          name={displayName}
          compact={compact}
          label={`${displayName}（你）`}
        />
      ) : null}
    </>
  );
}

function ScreenStreamVideo({ parentRef, getStream, active, mediaReady }) {
  const [elRef, setNode] = useSafeMediaRef(parentRef);

  const rebind = useCallback(() => {
    const stream = typeof getStream === "function" ? getStream() : null;
    if (active && stream) bindStreamToEl(elRef.current, stream, { mirror: false });
  }, [active, getStream, elRef]);

  useEffect(() => {
    rebind();
    const t = window.setTimeout(rebind, 60);
    return () => window.clearTimeout(t);
  }, [rebind, active, mediaReady]);

  const stream = typeof getStream === "function" ? getStream() : null;
  const showFallback = !active || !hasLiveVideoTrack(stream);

  return (
    <>
      <video
        ref={setNode}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-contain bg-black ${
          showFallback ? "opacity-0" : "opacity-100"
        }`}
      />
      {showFallback ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-950">
          <VideoOff className="h-8 w-8 text-white/40" />
          <p className="mt-2 text-xs font-semibold text-white/50">螢幕分享未就緒</p>
        </div>
      ) : null}
    </>
  );
}

/**
 * 焦點主畫面播放器（Full / Focus View）
 */
function FocusedVideoPlayer({
  tile,
  currentUserName,
  camOn,
  mediaReady,
  localVideoRef,
  screenVideoRef,
  getCameraStream,
  getScreenStream,
}) {
  if (!tile) return null;

  if (tile.kind === "self") {
    return (
      <div className="absolute inset-0 w-full h-full bg-navy-950">
        <LocalStreamVideo
          parentRef={localVideoRef}
          getStream={getCameraStream}
          camOn={camOn}
          mediaReady={mediaReady}
          displayName={currentUserName}
          compact={false}
          objectFit="cover"
        />
      </div>
    );
  }

  if (tile.kind === "screen") {
    return (
      <div className="absolute inset-0 w-full h-full bg-black">
        <ScreenStreamVideo
          parentRef={screenVideoRef}
          getStream={getScreenStream}
          active
          mediaReady={mediaReady}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-navy-700 via-navy-900 to-black">
      <div
        className={`h-28 w-28 rounded-full ${avatarColor(tile.name || tile.label)} flex items-center justify-center text-white text-4xl font-black ring-2 ring-white/20 shadow-lg`}
      >
        {(tile.name || tile.label || "?").slice(0, 1)}
      </div>
      <p className="mt-4 text-base font-bold text-white">{tile.label}</p>
      <p className="mt-1.5 text-xs text-white/45">遠端視訊待接 WebRTC</p>
    </div>
  );
}

function TileChrome({
  label,
  badge,
  muted,
  children,
  className = "",
  onClick,
  active = false,
  clickable = false,
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-navy-950 text-left transition-all block w-full h-full min-h-0 ${
        clickable ? "cursor-pointer hover:ring-2 hover:ring-mint-400/40 hover:border-mint-400/30" : ""
      } ${active ? "ring-2 ring-mint-400/50 border-mint-400/40" : ""} ${className}`}
    >
      {children}
      {badge ? (
        <div className="absolute left-2 top-2 z-[1] text-[10px] font-bold text-sky-100 bg-sky-500/85 px-2 py-0.5 rounded-full shadow-sm">
          {badge}
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 z-[1] flex items-center justify-between gap-1 px-2.5 py-1.5 bg-gradient-to-t from-black/75 to-transparent pointer-events-none">
        <span className="text-[11px] font-bold text-white truncate">{label}</span>
        {muted ? (
          <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-coral-500/90 text-white">
            <MicOff className="h-3 w-3" strokeWidth={2.4} />
          </span>
        ) : null}
      </div>
    </Comp>
  );
}

/**
 * 左側視訊面板：
 * - 預設宮格 Gallery（含自己 + 遠端 + 螢幕分享）
 * - 點擊成員 → Pin / Focus 主畫面 + 縮圖列
 * - compact：側邊欄模式（填滿父層高度，控制列永遠貼底）
 */
export default function VideoPanel({
  currentUserName = "我",
  micOn,
  camOn,
  screenSharing,
  mediaReady,
  mediaError,
  sttError,
  sttListening,
  localVideoRef,
  screenVideoRef,
  videoParticipants = [],
  rtcControls,
  onRetryMedia,
  getCameraStream,
  getScreenStream,
  compact = false,
}) {
  const rootRef = useRef(null);
  /** null = Gallery；否則為 SELF_ID / SCREEN_ID / 遠端 id */
  const [focusedId, setFocusedId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uiHint, setUiHint] = useState("");

  const others = useMemo(
    () => videoParticipants.filter((p) => !p.isSelf),
    [videoParticipants]
  );

  const tiles = useMemo(() => {
    const list = [];
    if (screenSharing) {
      list.push({
        id: SCREEN_ID,
        kind: "screen",
        label: "螢幕分享",
        badge: "螢幕分享",
      });
    }
    list.push({
      id: SELF_ID,
      kind: "self",
      label: `${currentUserName}（你）`,
      muted: !micOn,
    });
    others.forEach((p) => {
      list.push({
        id: String(p.id || p.name),
        kind: "remote",
        label: p.name,
        name: p.name,
      });
    });
    return list;
  }, [screenSharing, currentUserName, micOn, others]);

  const focusedTile = focusedId ? tiles.find((t) => t.id === focusedId) : null;
  const isGallery = !focusedTile;

  // 螢幕分享結束時清掉無效 focus
  useEffect(() => {
    if (focusedId === SCREEN_ID && !screenSharing) setFocusedId(null);
  }, [screenSharing, focusedId]);

  useEffect(() => {
    if (focusedId && focusedId !== SELF_ID && focusedId !== SCREEN_ID) {
      const stillThere = others.some((p) => String(p.id || p.name) === focusedId);
      if (!stillThere) setFocusedId(null);
    }
  }, [others, focusedId]);

  const bindStreamToVideo = useCallback((el, stream, mirror = false) => {
    if (!el) return;
    if (stream) {
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = true;
      el.playsInline = true;
      el.classList.toggle("scale-x-[-1]", mirror);
      const p = el.play();
      if (p?.catch) p.catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      // 進入全螢幕：強制回到宮格，避免只看到自己
      if (active) setFocusedId(null);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    const node = rootRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        setFocusedId(null);
        await node.requestFullscreen();
      }
    } catch {
      setUiHint("此瀏覽器無法進入全螢幕");
      window.setTimeout(() => setUiHint(""), 2500);
    }
  };

  const pinTile = (id) => {
    setFocusedId(id);
  };

  const backToGrid = () => setFocusedId(null);

  const viewControls = (
    <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
      <button
        type="button"
        title={isFullscreen ? "退出全螢幕" : "全螢幕"}
        onClick={toggleFullscreen}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md hover:bg-black/65 transition-all active:scale-95"
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" strokeWidth={2.2} />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.2} />
        )}
      </button>
    </div>
  );

  const renderSelfBody = (compact = false) => (
    <LocalStreamVideo
      parentRef={localVideoRef}
      getStream={getCameraStream}
      camOn={camOn}
      mediaReady={mediaReady}
      displayName={currentUserName}
      compact={compact}
      objectFit="cover"
    />
  );

  const renderScreenBody = () => (
    <ScreenStreamVideo
      parentRef={screenVideoRef}
      getStream={getScreenStream}
      active={screenSharing}
      mediaReady={mediaReady}
    />
  );

  const renderRemoteBody = (name, compact = false) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-navy-700/40 via-navy-900 to-black">
      <div
        className={`${compact ? "h-9 w-9 text-sm" : "h-12 w-12 text-base"} rounded-full ${avatarColor(
          name
        )} flex items-center justify-center text-white font-black ring-1 ring-white/20`}
      >
        {(name || "?").slice(0, 1)}
      </div>
      {!compact && <p className="mt-1.5 text-[10px] text-white/40">遠端視訊待接 WebRTC</p>}
    </div>
  );

  const renderTileContent = (tile, compact = false) => {
    if (tile.kind === "self") return renderSelfBody(compact);
    if (tile.kind === "screen") return renderScreenBody();
    return renderRemoteBody(tile.name || tile.label, compact);
  };

  const tileChromeProps = (tile, extraClass) => ({
    label: tile.label,
    badge: tile.badge,
    muted: tile.muted,
    className: extraClass,
    clickable: true,
    onClick: () => pinTile(tile.id),
  });

  const gridCols = compact
    ? "grid-cols-1"
    : tiles.length <= 1
    ? "grid-cols-1"
    : tiles.length === 2
    ? "grid-cols-1 sm:grid-cols-2"
    : isFullscreen
    ? "grid-cols-2 lg:grid-cols-3"
    : "grid-cols-2";

  const galleryView = (
    <div
      className={`flex-1 min-h-0 overflow-y-auto ${
        compact ? "p-2 gap-2" : "p-3 sm:p-4 gap-2.5"
      } grid ${gridCols} content-start`}
    >
      {tiles.map((tile) => (
        <TileChrome
          key={tile.id}
          {...tileChromeProps(
            tile,
            `${compact ? "aspect-[4/3]" : "aspect-video"} ${
              tile.kind === "screen"
                ? "border-sky-400/50 ring-1 ring-sky-400/25 bg-black"
                : tile.kind === "self" && camOn
                ? "border-mint-400/40 ring-1 ring-mint-400/20"
                : "border-white/10"
            }`
          )}
        >
          {renderTileContent(tile, compact || !isFullscreen)}
        </TileChrome>
      ))}
    </div>
  );

  const focusView = focusedTile && (
    <div className="flex-1 min-h-0 flex flex-col gap-2 p-2 sm:p-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <p className="text-[11px] font-bold text-white/70 truncate">
          焦點：{focusedTile.label}
        </p>
        <button
          type="button"
          onClick={backToGrid}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-white/20 bg-white/10 text-white text-[11px] font-bold hover:bg-white/15 transition-colors"
        >
          <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.2} />
          {compact ? "全體" : "返回全體視圖"}
        </button>
      </div>

      <div
        className={`relative w-full rounded-2xl overflow-hidden ${
          compact ? "aspect-video" : "flex-1 min-h-[200px]"
        }`}
      >
        <TileChrome
          label={focusedTile.label}
          badge={focusedTile.badge}
          muted={focusedTile.muted}
          className={`absolute inset-0 ${
            focusedTile.kind === "screen"
              ? "border-sky-400/50 ring-2 ring-sky-400/25 bg-black"
              : "border-mint-400/30"
          }`}
        >
          <FocusedVideoPlayer
            tile={focusedTile}
            currentUserName={currentUserName}
            camOn={camOn}
            mediaReady={mediaReady}
            localVideoRef={localVideoRef}
            screenVideoRef={screenVideoRef}
            getCameraStream={getCameraStream}
            getScreenStream={getScreenStream}
          />
        </TileChrome>
      </div>

      <div className="shrink-0 flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
        {tiles
          .filter((t) => t.id !== focusedTile.id)
          .map((tile) => {
            const useLiveSelf = tile.kind === "self" && focusedTile.kind !== "self";
            const useLiveScreen = tile.kind === "screen" && focusedTile.kind !== "screen";
            return (
              <TileChrome
                key={`thumb-${tile.id}`}
                {...tileChromeProps(
                  tile,
                  `aspect-video ${
                    compact ? "min-w-[88px] w-[42%]" : "min-w-[120px] w-[36%] sm:w-[140px]"
                  } flex-none h-auto ${
                    tile.kind === "screen"
                      ? "border-sky-400/40 bg-black"
                      : "border-white/10"
                  }`
                )}
              >
                {tile.kind === "self" && useLiveSelf ? (
                  renderSelfBody(true)
                ) : tile.kind === "screen" && useLiveScreen ? (
                  renderScreenBody()
                ) : tile.kind === "remote" ? (
                  renderRemoteBody(tile.name || tile.label, true)
                ) : tile.kind === "self" ? (
                  <CameraOffFallback name={currentUserName} compact label={`${currentUserName}（你）`} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <span className="text-[10px] font-bold text-sky-300">螢幕</span>
                  </div>
                )}
              </TileChrome>
            );
          })}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative flex flex-col min-h-0 h-full bg-gradient-to-b from-navy-900 via-navy-800 to-[#0f1b2d] rounded-3xl border border-white/10 shadow-card overflow-hidden"
    >
      <div
        className={`flex items-center justify-between gap-2 border-b border-white/10 shrink-0 pr-12 ${
          compact ? "px-2.5 py-2" : "px-3.5 py-2.5"
        }`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-mint-300">
            {compact ? "視訊" : "本機真實媒體"}
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {compact
              ? "點擊可放大檢視"
              : `${isGallery ? "宮格全覽" : "焦點畫面"} · ${mediaReady ? "已連線" : "等待權限…"} · ${
                  micOn ? "開麥" : "靜音"
                } · ${camOn ? "開鏡頭" : "關鏡頭"}${screenSharing ? " · 分享中" : ""}${
                  sttListening ? " · STT" : ""
                }`}
          </p>
        </div>
      </div>

      {viewControls}

      {(mediaError || sttError || uiHint) && (
        <div className={`${compact ? "px-2.5" : "px-3"} pt-2 shrink-0`}>
          <p className="text-[11px] text-coral-200 bg-coral-500/15 border border-coral-400/20 rounded-xl px-3 py-2">
            {uiHint || mediaError || sttError}
            {!mediaReady && onRetryMedia && !uiHint ? (
              <button type="button" onClick={onRetryMedia} className="ml-2 underline font-bold text-white">
                重新授權
              </button>
            ) : null}
          </p>
        </div>
      )}

      {isGallery ? galleryView : focusView}

      <div
        className={`shrink-0 border-t border-white/10 bg-black/25 backdrop-blur-md ${
          compact ? "px-2 py-2" : "px-3 py-2.5"
        }`}
      >
        {rtcControls}
        <p className="mt-1.5 text-center text-[10px] text-white/40">
          {compact ? "點擊成員放大 · 右上角全螢幕" : "點擊成員可放大 · 右上角可全螢幕"}
        </p>
      </div>
    </div>
  );
}
