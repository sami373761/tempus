"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The coin on the explorer's idle stage: a photogrammetry scan of a Macedonian
 * tetradrachm, turning slowly on its vertical axis, grabbable, and sitting on
 * nothing.
 *
 * It replaced the Colosseum video loop on 2026-10-07. The film was 2.2MB of
 * aerial footage that said "antiquity" the way a stock plate does; a coin you
 * can pick up and turn over is the same claim made with an object the game is
 * actually about. **Nothing is drawn behind it** — the canvas is transparent and
 * the stage's own `bg-page` is all that is under it, which is deliberate: a
 * backdrop would make this a scene rather than an object.
 *
 * Six things hold it up.
 *
 * - **The asset needs three decoders and ships with all of them.** The GLB
 *   declares `EXT_meshopt_compression`, `KHR_mesh_quantization` and
 *   `EXT_texture_webp` as *required*, so a loader missing any one of them
 *   throws rather than degrading. Quantization and WebP are native to
 *   `GLTFLoader`; Meshopt is not, and `setMeshoptDecoder()` is the whole of
 *   wiring it up. Without it the load fails with "Unsupported extension" and
 *   the stage stays empty, which looks exactly like a missing object.
 * - **Nothing is imported while the page is still loading, and nothing waits
 *   for the reader to arrive either.** `three` plus a 3.9MB model is far more
 *   than the front page should spend *during* its own load — on the critical
 *   path it is paid for in Largest Contentful Paint and in main-thread time
 *   the page needs to become interactive — so the module is a dynamic
 *   `import()` in an effect that two things can trigger: the block coming near
 *   the viewport, as before, or the browser going idle once the page has
 *   finished loading, whichever happens first. Gating on the observer alone
 *   meant the download *began* when the reader scrolled to the stage, so the
 *   coin was always a few seconds late to its own entrance; starting it in the
 *   first idle gap after `load` keeps it off the critical path while making it
 *   ready before anybody gets there. `near` latches on once and never back
 *   off, so scrolling past does not tear the WebGL context down.
 * - **The model arrives off-centre and pre-rotated, so it is measured rather
 *   than positioned by hand.** Its one node carries a translation, a 13.5x
 *   scale and a quaternion that lands the disc's face on world +Z — which is
 *   already the camera's axis, so the GLB's own orientation *is* the frontal
 *   view and nothing here corrects it. What does need correcting is the
 *   offset: the scene is shifted by its own bounding-box centre so the pivot it
 *   hangs in turns about the coin rather than about a point beside it.
 * - **The fit radius is the disc's own, and `Box3.getBoundingSphere()` is the
 *   trap**: it circumscribes the *box*, so for a disc it hands back half the
 *   box diagonal — about 1.41x the coin's real radius — and the coin comes out
 *   roughly a third smaller than the fill asked for. Taking the larger of the
 *   two screen-facing half-extents instead is exact *and* still safe at every
 *   angle, because a disc spinning about Y never presents more than its
 *   diameter either way. The coin never grows, never clips, and never appears
 *   to breathe as it turns. Refitted on resize, since the stage is fluid under
 *   `md`.
 * - **It is placed from its bottom edge and nudged left**, by moving the coin
 *   rather than the camera, so the view stays square to it and the spin picks
 *   up no skew. Centring it vertically would make every future "bigger" grow
 *   the coin downwards into the one part of the composition with no room —
 *   the pills beside it stop well short of the stage's floor.
 * - **Lighting only, no environment map.** The material is `metalness: 0` with
 *   `KHR_materials_specular` setting its specular colour to black, so image-
 *   based lighting has nothing to contribute and a `RoomEnvironment` would be
 *   pure cost. Two directional lights and a hemisphere are what give the relief
 *   its form; the albedo is baked into the scan's texture.
 * - **A release carries its momentum.** The pointer's recent travel is kept
 *   and a fast release hands that speed to the spin, which then loses it to
 *   friction — a flick turns the coin like a pinwheel instead of parking it.
 *   The friction is two terms because one will not do: viscous decay alone only
 *   ever approaches zero, so the coin would creep forever and the dwell that
 *   follows could never start.
 * - **`touch-action: pan-y`, not `none`.** The stage is a ~630px block in the
 *   middle of a page people are scrolling through, and swallowing vertical drag
 *   to allow a tilt nobody asked for would make the front page feel broken on a
 *   phone. Horizontal drag — the axis the coin actually turns on — still
 *   reaches us; vertical belongs to the document.
 *
 * It is `aria-hidden` and out of the tab order, exactly like the loop it
 * replaced. Turning it reveals nothing a reader is missing, so it is decoration
 * that answers the pointer rather than a control.
 */

/** One turn in ~24 seconds. Slow enough to read as a display piece rather than
 *  a spinner, fast enough that the relief is visibly moving. */
const SPIN_RATE = 0.26;

/** Radians per pixel dragged. 300px of travel is a little under half a turn,
 *  which is what makes flipping it over feel like one gesture. */
const DRAG_SENSITIVITY = 0.01;

/** How far off the horizontal the coin can be tilted, ~57deg. Free enough to
 *  look at the rim, short of the angles where a disc reads as a line. */
const PITCH_LIMIT = 1;

/** How much of the pointer's recent travel is weighed to get a release speed,
 *  in ms. Short, because the number wanted is the speed at the *moment* of
 *  release: a window wide enough to hold the slow start of a gesture averages
 *  a flick down to a drag. Wide enough to span two moves on a slow pointer. */
const FLICK_WINDOW_MS = 90;

/** A release this long after the last movement is a placement, not a throw —
 *  the pointer had already come to rest while still held down, which is how
 *  someone sets the coin to an angle they want to look at. */
const FLICK_IDLE_MS = 70;

/** Below this release speed the coin is being put down rather than thrown, and
 *  the hold-then-return below applies unchanged. rad/s. */
const FLICK_MIN = 1.1;

/** The fastest a flick can set it turning, rad/s — about 3.3 turns a second.
 *  Past that the relief stops reading as relief and the rim strobes against
 *  the refresh rate, so a violent swipe and an enthusiastic one come out the
 *  same. It is also what bounds the spin: the friction below takes this worst
 *  case to a standstill in ~5.2s and about 4.7 turns, which is the longest the
 *  coin can ever be left turning on its own. */
const FLICK_MAX = 21;

/** Viscous friction: the time constant of the spin's decay, in seconds. */
const FLING_TAU = 1.6;

/** Dry friction, rad/s². Viscous decay is proportional to the speed, so it only
 *  ever approaches zero — the coin would still be creeping a minute later and
 *  the dwell could never begin. A constant term is what brings it to an actual
 *  stop, and it is also what real friction in a bearing does.
 *
 *  The pair was picked by simulating the branch below rather than by eye, and
 *  checked at 30, 60 and 120fps (3 frames of variation across the whole decay,
 *  which is what being framerate-independent is worth): a hard flick runs ~5.2s
 *  and 4.7 turns, a middling one ~4.4s and 2.5, a gentle one ~3.1s and under a
 *  turn. Lighter friction than this and letting go reads as abandoning the coin
 *  rather than spinning it. */
const FLING_DRAG = 0.5;

/** Below this the spin is over, rad/s. Dry friction dominates by here, so the
 *  last of the speed is shed linearly and the stop has no jolt in it. */
const FLING_STOPPED = 0.02;

/** Time constant, in seconds, of a tilt bleeding out while the coin spins. Yaw
 *  is about the world vertical and pitch tilts the axis it turns about, so a
 *  fast spin left at the tilt it was flicked at wobbles like a dropped coin.
 *  Letting the tilt go as the spin takes over is both steadier to look at and
 *  what a disc actually does once it is turning. */
const FLING_PITCH_TAU = 0.4;

/** How long the coin stays exactly where it was let go of, before it starts
 *  easing home. Without it the return begins on the same frame as the release
 *  and the coin reads as sprung rather than handled — you let go and it is
 *  already leaving, which makes the whole gesture feel like it was refused.
 *  A second is long enough to see what you turned it to. */
const HOLD_MS = 1000;

/** Exponential half-life of the journey home, in seconds. Framerate-independent
 *  smoothing rather than a fixed-duration tween: the release can happen at any
 *  rotation, so there is no distance to divide a duration by. */
const RECENTRE_TAU = 0.17;

/** Close enough to frontal to stop easing and start spinning, in radians. */
const SETTLED = 0.002;

/** The one-off arrival when the model has finished loading. Unrelated to the
 *  stage's dissolve, which is `fadeMs` and belongs to the explorer. */
const LOAD_FADE_MS = 600;

/** How long the idle prefetch will wait for a genuinely quiet main thread
 *  before going anyway, in ms — `requestIdleCallback`'s own `timeout`.
 *
 *  The point of the idle callback is to miss the page's own load: the import
 *  and the 3.9MB fetch must not compete with what the front page needs to
 *  become interactive. But "idle" never arrives on a slow device with a busy
 *  tab, and waiting forever would put the coin back to being late. Two seconds
 *  after `load` is long past the measurements this is staying out of the way
 *  of, and still well inside the time it takes a reader to scroll four blocks
 *  down the page. */
const PREFETCH_IDLE_TIMEOUT_MS = 2000;

/** Fallback delay after `load` where `requestIdleCallback` does not exist
 *  (Safari before 17.4). A plain timer cannot know whether the thread is busy,
 *  so it only promises to be after the load rather than inside a gap. */
const PREFETCH_FALLBACK_MS = 1200;

/** The coin's diameter as a fraction of the stage's narrower side. Stated as a
 *  fill rather than as a margin because that is the thing anyone retuning it is
 *  actually looking at, and it is the number two rounds of "bigger" on
 *  2026-10-07 moved: 0.58 as first drawn, then a fifth up once the card around
 *  it was gone and there was no frame left to crowd, then 5% again. */
const STAGE_FILL = 0.73;

/** How far left of centre the coin sits, in multiples of its own radius — so it
 *  is a fixed fraction of the stage at every width, the camera distance being
 *  what adapts. Asked for on 2026-10-07: dead centre put it under the close
 *  button's corner rather than opposite the pills.
 *
 *  It only applies while the pills are *beside* the stage. Below `md` they sit
 *  above it and the stage is the full width of the column, so there is nothing
 *  to one side to lean away from and the offset reads as a coin that has simply
 *  failed to centre itself. */
const NUDGE_LEFT = 0.11;

/** Tailwind's `md`, where the explorer's grid puts the pills beside the stage.
 *  Watched as well as read: crossing it changes the stage's own box, so the
 *  `ResizeObserver` below would catch it in practice, but a layout whose width
 *  happened not to change would otherwise keep the wrong offset. */
const SIDE_BY_SIDE = "(min-width: 48rem)";

/** The coin hangs from its *bottom* edge, which sits this fraction of the
 *  stage's height above the stage's floor.
 *
 *  Centring it means a bigger coin grows down as well as up, and the room under
 *  it is the room the composition has least of — the pills beside it end well
 *  short of the stage's floor, so growth downwards is what reads as the coin
 *  sinking rather than as the coin getting larger. Asked for on 2026-10-07
 *  alongside the 5% that prompted it. The value is the gap the centred
 *  composition had at the fill *before* that 5%, so the bottom edge did not
 *  move and the whole of the increase went upward. */
const BOTTOM_ANCHOR = 0.164;

type Mode = "spin" | "drag" | "fling" | "hold" | "recentre";

export function ExplorerCoin({
  src,
  playing,
  fadeMs,
}: {
  /** The GLB's public URL, resolved on the server by `explorerModel()`. */
  src: string;
  /** Whether the idle stage is the layer being shown. */
  playing: boolean;
  /** The stage's dissolve, passed in rather than redeclared: the coin has to
   *  keep drawing for exactly as long as it is still on screen, and `FADE_MS`
   *  is the explorer's to own. */
  fadeMs: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [still, setStill] = useState(false);
  const [ready, setReady] = useState(false);

  /** Everything the render loop and the pointer handlers both touch. A ref
   *  rather than state because a drag must not re-render React 60 times a
   *  second, and because the WebGL context must survive every prop change. */
  const live = useRef({
    playing: false,
    still: false,
    mode: "spin" as Mode,
    yaw: 0,
    pitch: 0,
    /** Angular velocity about the vertical, rad/s. Only `fling` reads it: the
     *  idle spin is a constant and a drag is driven by the pointer. */
    spinVel: 0,
    /** When the post-release hold expires, on the `rAF` clock. */
    holdUntil: 0,
    dirty: true,
  });

  /** Set by the setup effect once the scene exists, so the pause effect below
   *  can reach into a closure it does not own. */
  const loop = useRef<{ start: () => void; stop: () => void } | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setStill(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    // The same generous margin the video used: the coin should already be
    // turning by the time the block is read, not start under the reader's eye.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        setOnScreen(visible);
        // One-way: tearing a WebGL context down on scroll and rebuilding it on
        // the way back would re-download nothing but would re-compile
        // everything, and the pause below is what actually saves the work.
        if (visible) setNear(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* The second way in, and the reason the coin is on the stage before anybody
     scrolls to it: once the page has finished loading, the first idle gap
     starts the download whether or not the block has been reached.

     This is the whole of the fix for "the coin is late". The observer above is
     still what guarantees it loads at all, and it still fires first for a
     reader who goes straight down the page — but on its own it meant the 3.9MB
     fetch *began* at the moment the stage came into view, so the stage was
     empty for as long as the model took. Moving the start to `load` + idle
     keeps every byte of it off the critical path (which is what it was gated
     for) and still has it decoded and drawn by the time the reader arrives. */
  useEffect(() => {
    if (near) return;

    let cancelled = false;
    let handle: number | undefined;
    let idle = false;

    const begin = () => {
      if (cancelled) return;
      const start = () => {
        if (!cancelled) setNear(true);
      };
      if (typeof window.requestIdleCallback === "function") {
        idle = true;
        handle = window.requestIdleCallback(start, {
          timeout: PREFETCH_IDLE_TIMEOUT_MS,
        });
      } else {
        handle = window.setTimeout(start, PREFETCH_FALLBACK_MS);
      }
    };

    // `readyState` is already "complete" on a client-side navigation into this
    // page, where the `load` event fired long ago and will not fire again.
    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", begin);
      if (handle === undefined) return;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [near]);

  useEffect(() => {
    live.current.still = still;
    live.current.dirty = true;
  }, [still]);

  /* Pausing is the whole of the budget here: a 239k-triangle scan redrawn at
     60fps behind an opaque panel, or below the fold, is a tab that never goes
     quiet.

     **The stop waits out the dissolve, and for this canvas that is not a nicety
     the way it was for the video.** A WebGL drawing buffer is cleared after it
     is composited unless `preserveDrawingBuffer` is set — which costs memory
     and a copy per frame — so a canvas that stops rendering is not holding its
     last frame, it is holding an undefined one, and in practice it goes blank.
     Stopping on the same tick the panel starts fading in therefore made the
     coin vanish instantly instead of dissolving. Drawing until the layer above
     is opaque costs `fadeMs` of frames and keeps the crossfade honest. */
  useEffect(() => {
    live.current.playing = playing && onScreen;
    if (!ready) return;

    if (live.current.playing) {
      loop.current?.start();
      return;
    }

    const timer = window.setTimeout(() => loop.current?.stop(), fadeMs);
    return () => window.clearTimeout(timer);
  }, [playing, onScreen, ready, fadeMs]);

  useEffect(() => {
    if (!near) return;
    const node = host.current;
    if (!node) return;

    let disposed = false;
    let teardown: (() => void) | null = null;

    void (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js"
      );
      const { MeshoptDecoder } = await import(
        "three/examples/jsm/libs/meshopt_decoder.module.js"
      );
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // Nothing behind the coin, which is the point: the stage's own black is
      // what shows through, so the layer composites like the photographs do.
      renderer.setClearAlpha(0);
      // The scan's albedo is baked and bright; a filmic curve would grey it,
      // and none at all clips the lit side of the relief.
      renderer.toneMapping = THREE.NeutralToneMapping;

      const canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      canvas.tabIndex = -1;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.cursor = "grab";
      // See the note above: horizontal drag is ours, vertical is the page's.
      canvas.style.touchAction = "pan-y";
      node.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x2b2b33, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2, 3, 4);
      scene.add(key);
      // The coin is double-sided and spends half of every turn with its back to
      // the key light; without a fill the far face passes through as a
      // silhouette.
      const fill = new THREE.DirectionalLight(0xffffff, 0.9);
      fill.position.set(-3, -1, -2.5);
      scene.add(fill);

      /* Yaw about the world vertical, then pitch in the frame that leaves —
         which is what makes a drag feel like turning an object in the hand
         rather than steering a gimbal. The default XYZ order tilts the axis the
         spin then happens about. */
      const pivot = new THREE.Group();
      pivot.rotation.order = "YXZ";
      scene.add(pivot);

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      let gltfScene: import("three").Group | null = null;
      try {
        const gltf = await loader.loadAsync(src);
        if (disposed) {
          renderer.dispose();
          return;
        }
        gltfScene = gltf.scene;
      } catch (error) {
        // A failed load leaves the stage as the black it already was. There is
        // no fallback to fall back to — the coin is the whole of this layer —
        // and a broken-image affordance over the front page is worse than an
        // empty one. It is logged rather than swallowed because the three ways
        // this fails (the key missing from the dev proxy's allowlist, r2.dev
        // unreachable, a decoder not wired up) all look identical from the
        // outside: an empty stage.
        console.warn("[tempus] the explorer's coin failed to load", error);
        renderer.dispose();
        canvas.remove();
        return;
      }

      // Hang it on the pivot by its own centre, so the spin turns the coin
      // rather than swinging it. The GLB's node transform already faces the
      // disc at +Z; only the offset is ours to undo.
      const box = new THREE.Box3().setFromObject(gltfScene);
      gltfScene.position.sub(box.getCenter(new THREE.Vector3()));
      pivot.add(gltfScene);

      /* Half the larger of the two extents that face the camera — **not** the
         bounding sphere. `Box3.getBoundingSphere()` circumscribes the *box*, so
         for a disc it returns half the box diagonal, ~1.41x the coin's own
         radius, and the coin renders about a third smaller than whatever fill
         is asked for. A disc spinning about Y never presents more than its
         diameter in either axis — the vertical extent is constant and the
         horizontal one only shrinks towards the rim — so this is the true worst
         case and the fit still holds at every angle. */
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y) / 2 || 1;

      const sideBySide = window.matchMedia(SIDE_BY_SIDE);

      function fit() {
        const width = node!.clientWidth;
        const height = node!.clientHeight;
        if (!width || !height) return;

        renderer.setSize(width, height, false);
        camera.aspect = width / height;

        // The distance at which a sphere of this radius exactly fills the
        // narrower of the two fields of view, plus room to sit in.
        const vFov = (camera.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
        // The distance at which the coin exactly fills the narrower of the two
        // fields of view, divided by the share of it that it should take up.
        const distance =
          Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) /
          STAGE_FILL;

        /* Placed by moving the coin rather than the camera, so the view stays
           square to it and the spin picks up no skew. The vertical half of the
           frame is measured with `tan` where the fit above used `sin`: the fit
           is a sphere's tangency, which is what guarantees no clipping at any
           angle of the spin, while this is where a flat edge actually lands. */
        const halfViewHeight = distance * Math.tan(vFov / 2);
        pivot.position.set(
          -radius * (sideBySide.matches ? NUDGE_LEFT : 0),
          radius - halfViewHeight * (1 - 2 * BOTTOM_ANCHOR),
          0,
        );

        camera.position.set(0, 0, distance);
        camera.lookAt(0, 0, 0);
        camera.near = Math.max(distance - radius * 2, 0.01);
        camera.far = distance + radius * 2;
        camera.updateProjectionMatrix();
        live.current.dirty = true;
      }

      fit();
      const resize = new ResizeObserver(fit);
      resize.observe(node);
      sideBySide.addEventListener("change", fit);

      /* ----- the loop ----- */

      let raf = 0;
      let running = false;
      let last = 0;

      function frame(now: number) {
        const state = live.current;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        if (state.mode === "spin") {
          // A thing that turns forever is exactly what reduced motion is for,
          // so under it the coin simply stands still — and stays grabbable,
          // because that motion is the reader's own.
          if (!state.still) {
            state.yaw += SPIN_RATE * dt;
            state.dirty = true;
          }
        } else if (state.mode === "fling") {
          state.yaw += state.spinVel * dt;

          /* Two frictions, and both are needed. The viscous term is
             framerate-independent exponential decay, like the journey home
             below; the dry term is the constant that actually reaches zero.
             Without it `spinVel` would halve forever and `fling` would never
             hand over, so the coin would never dwell and never recentre. */
          const direction = Math.sign(state.spinVel);
          const speed =
            Math.abs(state.spinVel) * Math.exp(-dt / FLING_TAU) -
            FLING_DRAG * dt;
          state.spinVel = speed > FLING_STOPPED ? direction * speed : 0;

          // The tilt goes while the spin is still fast, so what comes to rest
          // is a coin turning flat rather than one wobbling about a tipped
          // axis. See FLING_PITCH_TAU.
          state.pitch +=
            (0 - state.pitch) * (1 - Math.exp(-dt / FLING_PITCH_TAU));

          if (state.spinVel === 0) {
            // Wrap for the same reason the release does: the way home is then
            // the short way round, however many turns the flick was worth.
            state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
            state.mode = "hold";
            state.holdUntil = now + HOLD_MS;
          }
          state.dirty = true;
        } else if (state.mode === "hold") {
          // Deliberately nothing to draw: the coin is exactly where it was left,
          // so the hold costs a comparison per frame and no render at all.
          if (now >= state.holdUntil) state.mode = "recentre";
        } else if (state.mode === "recentre") {
          const k = 1 - Math.exp(-dt / RECENTRE_TAU);
          state.yaw += (0 - state.yaw) * k;
          state.pitch += (0 - state.pitch) * k;
          if (Math.abs(state.yaw) < SETTLED && Math.abs(state.pitch) < SETTLED) {
            // Hand it back to the spin from exactly frontal, rather than from
            // a thousandth of a radian short of it.
            state.yaw = 0;
            state.pitch = 0;
            state.mode = "spin";
          }
          state.dirty = true;
        }

        if (state.dirty) {
          pivot.rotation.y = state.yaw;
          pivot.rotation.x = state.pitch;
          renderer.render(scene, camera);
          state.dirty = false;
        }

        if (running) raf = requestAnimationFrame(frame);
      }

      function start() {
        if (running) return;
        running = true;
        // Always arrive frontal. The layer is fading in from nothing, so a
        // reset here is invisible, and it is what guarantees the coin is never
        // found where the last visitor left it.
        live.current.mode = "spin";
        live.current.yaw = 0;
        live.current.pitch = 0;
        live.current.spinVel = 0;
        live.current.dirty = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }

      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }

      loop.current = { start, stop };

      /* ----- the grab ----- */

      let lastX = 0;
      let lastY = 0;

      /* The pointer's recent horizontal travel, newest last, which is what a
         release speed is read off. `performance.now()` rather than
         `event.timeStamp` so these sit on the same clock as `holdUntil` and the
         `rAF` argument, whatever a browser's event timeline is based on. */
      const trail: { at: number; x: number }[] = [];

      function onDown(event: PointerEvent) {
        if (!live.current.playing) return;
        canvas.setPointerCapture(event.pointerId);
        live.current.mode = "drag";
        // Catching a spinning coin stops it, which is the whole of what makes
        // grabbing one mid-flick feel like catching it.
        live.current.spinVel = 0;
        lastX = event.clientX;
        lastY = event.clientY;
        trail.length = 0;
        trail.push({ at: performance.now(), x: event.clientX });
        canvas.style.cursor = "grabbing";
        // Otherwise the gesture starts a text selection across the card.
        event.preventDefault();
      }

      function onMove(event: PointerEvent) {
        const state = live.current;
        if (state.mode !== "drag") return;
        state.yaw += (event.clientX - lastX) * DRAG_SENSITIVITY;
        state.pitch = Math.max(
          -PITCH_LIMIT,
          Math.min(PITCH_LIMIT, state.pitch + (event.clientY - lastY) * DRAG_SENSITIVITY),
        );
        lastX = event.clientX;
        lastY = event.clientY;
        const at = performance.now();
        trail.push({ at, x: event.clientX });
        // Keep only what the release will actually weigh. One sample before the
        // window's edge is kept deliberately: dropping to a single sample would
        // leave no span to divide by on a slow pointer.
        while (trail.length > 2) {
          const next = trail[1];
          if (!next || at - next.at <= FLICK_WINDOW_MS) break;
          trail.shift();
        }
        state.dirty = true;
      }

      /** The speed the pointer was travelling at when it let go, in rad/s —
       *  signed, and 0 when the pointer was already at rest. */
      function releaseSpin(now: number) {
        const latest = trail.at(-1);
        const oldest = trail[0];
        if (!latest || !oldest || latest === oldest) return 0;
        // A pointer that stopped while still held down is placing the coin, not
        // throwing it, and its stale travel must not become a spin.
        if (now - latest.at > FLICK_IDLE_MS) return 0;
        const span = (latest.at - oldest.at) / 1000;
        if (span <= 0) return 0;
        return ((latest.x - oldest.x) * DRAG_SENSITIVITY) / span;
      }

      /** `flick` is false for a cancel: the browser took the pointer away (a
       *  vertical swipe becoming a scroll is the usual way), which is not the
       *  reader letting go and must not become a spin. */
      function release(flick: boolean) {
        const state = live.current;
        if (state.mode !== "drag") return;
        canvas.style.cursor = "grab";

        const now = performance.now();
        const thrown = flick ? releaseSpin(now) : 0;
        /* Reduced motion skips the throw outright rather than shortening it. A
           drag is the reader's own motion, which is why the coin stays grabbable
           under that setting — but a coin left turning on its own for seconds
           afterwards is the perpetual rotation the setting exists to stop. */
        if (!state.still && Math.abs(thrown) >= FLICK_MIN) {
          state.spinVel =
            Math.sign(thrown) * Math.min(Math.abs(thrown), FLICK_MAX);
          state.mode = "fling";
          state.dirty = true;
          return;
        }

        // Wrap into (-pi, pi] here rather than when the journey starts, so the
        // way home is the short way round however many times the coin has been
        // spun. The wrap is the same angle, so the held frame does not move.
        state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
        state.mode = "hold";
        state.holdUntil = now + HOLD_MS;
      }

      const onUp = () => release(true);
      const onCancel = () => release(false);

      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onCancel);

      // One frame now, so the coin is on the stage whether or not it is the
      // layer being shown — and `start()` from the pause effect below is what
      // sets it turning.
      renderer.render(scene, camera);
      setReady(true);
      if (live.current.playing) start();

      teardown = () => {
        stop();
        loop.current = null;
        resize.disconnect();
        sideBySide.removeEventListener("change", fit);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onCancel);
        // A WebGL context is not garbage: browsers cap how many may exist, and
        // React's strict mode mounts this effect twice in development.
        gltfScene?.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const material = object.material;
          for (const entry of Array.isArray(material) ? material : [material]) {
            for (const value of Object.values(entry)) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            entry.dispose();
          }
        });
        renderer.dispose();
        canvas.remove();
      };
    })();

    return () => {
      disposed = true;
      teardown?.();
    };
  }, [near, src]);

  return (
    <div aria-hidden className="relative h-full w-full">
      <div
        ref={host}
        className="explorer-motion absolute inset-0"
        style={{
          // Two transitions on one element, and they answer different things.
          // `opacity` is the one-off arrival once the model has loaded, which
          // is the whole of what covers a 3.9MB download. `transform` is the
          // stage's own: resting slightly scaled up while the layer is off and
          // settling as it arrives, which is exactly what `StagePhoto` does and
          // for the same reason — a layer that only changes opacity reads as a
          // slideshow rather than as a dissolve. Matching it is what makes the
          // coin feel like one of the seven panels instead of a hole cut in the
          // stage.
          opacity: ready ? 1 : 0,
          transform: playing ? "scale(1)" : "scale(1.06)",
          transitionProperty: "opacity, transform",
          transitionDuration: `${LOAD_FADE_MS}ms, ${fadeMs * 2}ms`,
          transitionTimingFunction: "ease-out",
        }}
      />

      {/* What is on the stage while the model is on its way.

          The prefetch above means most readers never see it — the coin is
          usually drawn before the block has been scrolled to — but a cold cache
          on a slow connection is exactly the case the idle gap cannot fix, and
          an empty stage then looks like a panel that failed rather than one
          that is loading.

          It is the menu button's own arc (`.pending-ring` in app/globals.css),
          not a second spinner invented for this: the two are the same statement
          and the shared rule is also what gives this one its reduced-motion
          behaviour for free. `--ring-inset: 0` is the one difference — the
          menu's ring hangs off the button it belongs to, and this one owns its
          box.

          `data-busy` is armed only once the download has actually started, and
          the rule's own 140ms fade is what keeps a fast load from flashing a
          ring nobody needed to see. */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 block h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-ink/45"
        style={{ opacity: ready ? 0 : 1, transition: `opacity ${LOAD_FADE_MS}ms ease-out` }}
      >
        <span
          className="pending-ring"
          data-busy={near && !ready}
          style={{ ["--ring-inset" as string]: "0px" }}
        />
      </span>
    </div>
  );
}
