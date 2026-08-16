/**
 * Harkbell voice widget.
 *
 * Drops a call button onto a business's own website and runs a real WebRTC
 * conversation with that business's published agent. It speaks the Dograh
 * public-embed protocol (config → init → TURN → WebSocket signalling → SDP),
 * but owns its own interface.
 *
 * Design notes that matter for an embeddable script:
 *
 * - Everything renders inside a shadow root. A widget that injects global CSS
 *   into somebody else's site will eventually break their layout or be broken
 *   by it; the shadow boundary makes that impossible in both directions.
 * - The panel tells the caller what is happening at every step — connecting,
 *   listening, the agent talking, why the microphone was refused — because a
 *   silent voice widget is indistinguishable from a broken one.
 * - Keyboard and screen-reader users get real buttons, a focus trap while the
 *   panel is open, Escape to close, and a live region for status.
 *
 * Public API: window.VocalonixWidget (also aliased to window.DograhWidget so
 * snippets published before this file existed keep working).
 */
(function () {
  "use strict";

  var SCRIPT_NAME = "vocalonix-widget.js";
  var PREFERS_REDUCED_MOTION =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = {
    config: {},
    initialized: false,
    open: false,
    status: "idle",
    statusDetail: "",
    pc: null,
    ws: null,
    stream: null,
    sessionToken: null,
    workflowRunId: null,
    workflowId: null,
    pcId: null,
    turn: null,
    audioEl: null,
    muted: false,
    callStartedAt: null,
    timerId: null,
    graceful: false,
    audioContext: null,
    meterRaf: null,
    localAnalyser: null,
    remoteAnalyser: null,
    root: null,
    shadow: null,
    lastFocus: null,
    callbacks: {},
  };

  /* ------------------------------------------------------------------ utils */

  function emit(name, payload) {
    var handler = state.callbacks[name];
    if (typeof handler === "function") {
      try {
        handler(payload);
      } catch (error) {
        console.error("Harkbell widget: callback " + name + " threw", error);
      }
    }
  }

  /**
   * Business accent colours are arbitrary, so label colour is derived rather
   * than assumed — white text on a pale brand colour is unreadable.
   */
  function readableTextOn(hex) {
    var value = String(hex || "").replace("#", "");
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    if (!/^[0-9a-f]{6}$/i.test(value)) return "#ffffff";
    var channels = [0, 2, 4].map(function (offset) {
      var channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    var luminance =
      0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance > 0.45 ? "#111827" : "#ffffff";
  }

  /**
   * Reads the host page's own background to decide light or dark, walking up
   * from body until something is actually painted. Falls back to the visitor's
   * OS preference only when the page never paints a background of its own.
   */
  function hostIsDark() {
    var node = document.body;
    while (node) {
      var background = window.getComputedStyle(node).backgroundColor;
      var parts = /rgba?\(([^)]+)\)/.exec(background);
      if (parts) {
        var values = parts[1].split(",").map(function (value) {
          return parseFloat(value);
        });
        var alpha = values.length > 3 ? values[3] : 1;
        if (alpha > 0.1) {
          var luminance =
            (0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]) / 255;
          return luminance < 0.4;
        }
      }
      node = node.parentElement;
    }
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function formatDuration(seconds) {
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------------------------- init */

  function currentScript() {
    if (document.currentScript && document.currentScript.src) {
      return document.currentScript;
    }
    var scripts = document.querySelectorAll('script[src*="' + SCRIPT_NAME + '"]');
    return scripts.length > 0 ? scripts[scripts.length - 1] : null;
  }

  function resolveApiBase(scriptUrl, provided) {
    if (provided) {
      return /^https?:\/\//.test(provided)
        ? provided.replace(/\/+$/, "")
        : "https://" + provided.replace(/\/+$/, "");
    }
    if (scriptUrl.hostname === "localhost" || scriptUrl.hostname === "127.0.0.1") {
      return "http://" + scriptUrl.hostname + ":8000";
    }
    return scriptUrl.origin.replace(/:\d+$/, "") + ":8000";
  }

  async function init() {
    if (state.initialized) return;

    var script = currentScript();
    if (!script) {
      console.error("Harkbell widget: could not find its own script tag.");
      return;
    }

    var scriptUrl = new URL(script.src);
    var token = scriptUrl.searchParams.get("token");
    if (!token) {
      console.error("Harkbell widget: the script URL is missing its token.");
      return;
    }

    state.config = {
      token: token,
      apiBaseUrl: resolveApiBase(scriptUrl, scriptUrl.searchParams.get("apiEndpoint")),
      position: "bottom-right",
      accent: "#5b5bd6",
      buttonText: "Talk to us",
      agentName: "the team",
      businessName: "",
      callToActionText: "Start a voice conversation",
      autoStart: false,
      contextVariables: parseContext(script.getAttribute("data-vocalonix-context")),
    };

    var response;
    try {
      response = await fetch(
        state.config.apiBaseUrl + "/api/v1/public/embed/config/" + token,
        { method: "GET", headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      console.error("Harkbell widget: the voice service is unreachable.", error);
      return;
    }
    if (!response.ok) {
      console.error(
        "Harkbell widget: this embed token was rejected (" + response.status + ").",
      );
      return;
    }

    var data = await response.json();
    var settings = data.settings || {};
    state.config.workflowId = data.workflow_id;
    state.config.position = settings.position || data.position || "bottom-right";
    state.config.accent = settings.buttonColor || state.config.accent;
    state.config.buttonText = settings.buttonText || state.config.buttonText;
    state.config.agentName = settings.agentName || state.config.agentName;
    state.config.businessName = settings.businessName || "";
    state.config.callToActionText =
      settings.callToActionText || state.config.callToActionText;
    state.config.prompts = Array.isArray(settings.prompts) ? settings.prompts : [];
    state.config.autoStart = Boolean(data.auto_start || settings.autoStart);
    // `headless=1` lets a host page (the dashboard's test call) drive the same
    // published widget through the API without its launcher appearing.
    state.config.headless =
      settings.embedMode === "headless" ||
      scriptUrl.searchParams.get("headless") === "1";

    state.initialized = true;

    if (!state.config.headless) render();
    emit("ready", { workflowId: state.config.workflowId });

    if (state.config.autoStart) {
      setTimeout(function () {
        openPanel();
        startCall();
      }, 600);
    }
  }

  function parseContext(raw) {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Harkbell widget: data-vocalonix-context is not valid JSON.");
      return {};
    }
  }

  /* ------------------------------------------------------------------- view */

  function styles() {
    return [
      ":host { all: initial; }",
      "*, *::before, *::after { box-sizing: border-box; }",
      ".root {",
      "  position: fixed; z-index: 2147483000;",
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
      "  font-size: 15px; line-height: 1.45; color: #111827;",
      "  display: flex; flex-direction: column; align-items: flex-end; gap: 12px;",
      "}",
      ".root.bottom-right { bottom: 20px; right: 20px; }",
      ".root.bottom-left { bottom: 20px; left: 20px; align-items: flex-start; }",
      ".root.top-right { top: 20px; right: 20px; }",
      ".root.top-left { top: 20px; left: 20px; align-items: flex-start; }",
      ".root.top-right .panel, .root.top-left .panel { order: 2; }",

      ".launcher {",
      "  display: inline-flex; align-items: center; gap: 9px;",
      "  padding: 13px 20px; border: 0; border-radius: 999px;",
      "  font: inherit; font-weight: 600; cursor: pointer;",
      "  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.24);",
      "  max-width: calc(100vw - 40px);",
      "  transition: transform 120ms ease, box-shadow 200ms ease, filter 150ms ease;",
      "}",
      ".launcher:hover { filter: brightness(1.06); box-shadow: 0 10px 26px rgba(15, 23, 42, 0.3); }",
      ".launcher:active { transform: scale(0.98); }",
      ".launcher:focus-visible { outline: 3px solid #111827; outline-offset: 3px; }",
      ".launcher .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",

      ".panel {",
      "  width: 336px; max-width: calc(100vw - 32px);",
      "  background: #ffffff; border-radius: 18px;",
      "  border: 1px solid rgba(15, 23, 42, 0.1);",
      "  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);",
      "  overflow: hidden;",
      PREFERS_REDUCED_MOTION ? "" : "  animation: rise 180ms ease-out;",
      "}",
      "@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }",

      ".head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 14px 16px; }",
      ".head .who { min-width: 0; flex: 1; }",
      ".head .agent { font-weight: 650; font-size: 15px; letter-spacing: -0.01em; }",
      ".head .biz { font-size: 12.5px; opacity: 0.82; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".icon-btn {",
      "  display: inline-flex; align-items: center; justify-content: center;",
      "  width: 32px; height: 32px; border-radius: 9px; border: 0; cursor: pointer;",
      "  background: rgba(255, 255, 255, 0.16); color: inherit;",
      "}",
      ".icon-btn:hover { background: rgba(255, 255, 255, 0.28); }",
      ".icon-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }",

      ".body { padding: 18px 16px 16px; }",
      ".status { display: flex; align-items: center; gap: 9px; font-weight: 600; font-size: 14px; }",
      ".dot { width: 9px; height: 9px; border-radius: 50%; background: #9ca3af; flex: none; }",
      ".dot.live { background: #16a34a; }",
      ".dot.busy { background: #f59e0b; }",
      ".dot.bad { background: #dc2626; }",
      PREFERS_REDUCED_MOTION
        ? ""
        : ".dot.busy { animation: blink 1.4s ease-in-out infinite; }",
      "@keyframes blink { 50% { opacity: 0.35; } }",
      ".detail { margin-top: 6px; font-size: 13.5px; color: #4b5563; }",
      ".detail.bad { color: #b91c1c; }",

      ".meter { display: flex; align-items: flex-end; gap: 3px; height: 34px; margin: 16px 0 4px; }",
      ".meter i { display: block; flex: 1; min-height: 3px; height: 3px; border-radius: 2px; background: #e5e7eb; transition: height 90ms linear, background 160ms linear; }",
      ".meter.speaking i { background: #16a34a; }",

      ".timer { font-variant-numeric: tabular-nums; font-size: 13px; color: #6b7280; text-align: center; }",

      ".prompts { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }",
      ".prompts li { font-size: 13px; color: #4b5563; padding-left: 16px; position: relative; }",
      '.prompts li::before { content: "“"; position: absolute; left: 2px; top: -1px; opacity: 0.55; }',

      ".actions { display: flex; gap: 8px; margin-top: 16px; }",
      ".btn {",
      "  flex: 1; padding: 12px 14px; border-radius: 11px; border: 0;",
      "  font: inherit; font-weight: 620; cursor: pointer;",
      "  transition: filter 140ms ease;",
      "}",
      ".btn:hover { filter: brightness(1.05); }",
      ".btn:focus-visible { outline: 3px solid #111827; outline-offset: 2px; }",
      ".btn[disabled] { opacity: 0.55; cursor: default; filter: none; }",
      ".btn.ghost { flex: 0 0 auto; background: #f3f4f6; color: #111827; }",
      ".btn.end { background: #dc2626; color: #ffffff; }",

      ".foot { padding: 10px 16px 14px; font-size: 11.5px; color: #9ca3af; text-align: center; }",

      "@media (max-width: 460px) {",
      "  .root { left: 12px; right: 12px; bottom: 12px; align-items: stretch; }",
      "  .panel { width: auto; }",
      "  .launcher { justify-content: center; }",
      "}",

      // Dark styling follows the page the widget is embedded in, not the
      // visitor's OS: a dark panel bolted onto a light business site looks
      // broken, and most business sites are light regardless of OS setting.
      ".root.dark .panel { background: #14161b; border-color: rgba(255, 255, 255, 0.12); color: #f3f4f6; }",
      ".root.dark .detail { color: #b6bcc7; }",
      ".root.dark .detail.bad { color: #fca5a5; }",
      ".root.dark .timer, .root.dark .foot { color: #8b93a1; }",
      ".root.dark .prompts li { color: #b6bcc7; }",
      ".root.dark .meter i { background: #2b2f38; }",
      ".root.dark .btn.ghost { background: #22262e; color: #f3f4f6; }",
      ".root.dark .btn:focus-visible, .root.dark .launcher:focus-visible { outline-color: #ffffff; }",
      ".sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }",
    ].join("\n");
  }

  var MIC_ICON =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>' +
    '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>' +
    '<line x1="8" y1="23" x2="16" y2="23"/></svg>';

  var CLOSE_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

  function render() {
    var host = document.createElement("div");
    host.setAttribute("data-vocalonix-widget", "");
    document.body.appendChild(host);

    state.shadow = host.attachShadow({ mode: "open" });
    var sheet = document.createElement("style");
    sheet.textContent = styles();
    state.shadow.appendChild(sheet);

    state.root = element(
      "div",
      "root " + state.config.position + (hostIsDark() ? " dark" : ""),
    );
    state.shadow.appendChild(state.root);

    state.audioEl = document.createElement("audio");
    state.audioEl.autoplay = true;
    state.audioEl.setAttribute("playsinline", "");
    state.audioEl.style.display = "none";
    state.root.appendChild(state.audioEl);

    paint();
  }

  function paint() {
    if (!state.root) return;
    var keep = state.audioEl;
    Array.prototype.slice.call(state.root.children).forEach(function (child) {
      if (child !== keep) state.root.removeChild(child);
    });

    if (state.open) state.root.appendChild(panel());
    state.root.appendChild(launcher());
  }

  function launcher() {
    var accent = state.config.accent;
    var button = element("button", "launcher");
    button.type = "button";
    button.style.background = accent;
    button.style.color = readableTextOn(accent);
    button.setAttribute("aria-expanded", state.open ? "true" : "false");
    button.innerHTML = MIC_ICON;
    button.appendChild(element("span", "label", state.open ? "Hide" : state.config.buttonText));
    button.addEventListener("click", function () {
      if (state.open) closePanel();
      else openPanel();
    });
    return button;
  }

  var STATUS_TEXT = {
    idle: "Ready when you are",
    connecting: "Connecting…",
    listening: "Listening",
    speaking: "Speaking",
    ended: "Call ended",
    failed: "Could not connect",
  };

  function statusTone(status) {
    if (status === "listening" || status === "speaking") return "live";
    if (status === "connecting") return "busy";
    if (status === "failed") return "bad";
    return "";
  }

  function panel() {
    var accent = state.config.accent;
    var onAccent = readableTextOn(accent);
    var wrap = element("div", "panel");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "false");
    wrap.setAttribute("aria-label", "Voice call with " + state.config.agentName);

    var head = element("div", "head");
    head.style.background = accent;
    head.style.color = onAccent;
    var who = element("div", "who");
    who.appendChild(element("div", "agent", state.config.agentName));
    if (state.config.businessName) {
      who.appendChild(element("div", "biz", state.config.businessName));
    }
    head.appendChild(who);
    var close = element("button", "icon-btn");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = CLOSE_ICON;
    close.addEventListener("click", closePanel);
    head.appendChild(close);
    wrap.appendChild(head);

    var body = element("div", "body");

    var status = element("div", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    var tone = statusTone(state.status);
    status.appendChild(element("span", "dot" + (tone ? " " + tone : "")));
    status.appendChild(element("span", null, STATUS_TEXT[state.status] || "Ready"));
    body.appendChild(status);

    if (state.statusDetail) {
      body.appendChild(
        element(
          "p",
          "detail" + (state.status === "failed" ? " bad" : ""),
          state.statusDetail,
        ),
      );
    }

    var live = state.status === "listening" || state.status === "speaking";
    if (live) {
      var meter = element("div", "meter" + (state.status === "speaking" ? " speaking" : ""));
      meter.setAttribute("aria-hidden", "true");
      for (var i = 0; i < 13; i += 1) meter.appendChild(document.createElement("i"));
      body.appendChild(meter);

      var elapsed = state.callStartedAt
        ? Math.round((Date.now() - state.callStartedAt) / 1000)
        : 0;
      body.appendChild(element("div", "timer", formatDuration(elapsed)));
    } else if (state.status === "idle" && state.config.prompts.length > 0) {
      var list = element("ul", "prompts");
      state.config.prompts.slice(0, 3).forEach(function (prompt) {
        list.appendChild(element("li", null, prompt + "”"));
      });
      body.appendChild(list);
    }

    var actions = element("div", "actions");
    if (live || state.status === "connecting") {
      var mute = element("button", "btn ghost", state.muted ? "Unmute" : "Mute");
      mute.type = "button";
      mute.disabled = !state.stream;
      mute.addEventListener("click", toggleMute);
      actions.appendChild(mute);

      var end = element("button", "btn end", "End call");
      end.type = "button";
      end.addEventListener("click", function () {
        stopCall({ graceful: true, status: "ended", detail: "Thanks for calling." });
      });
      actions.appendChild(end);
    } else {
      var start = element(
        "button",
        "btn",
        state.status === "failed" ? "Try again" : "Start call",
      );
      start.type = "button";
      start.style.background = accent;
      start.style.color = onAccent;
      start.addEventListener("click", startCall);
      actions.appendChild(start);
    }
    body.appendChild(actions);
    wrap.appendChild(body);

    wrap.appendChild(
      element(
        "div",
        "foot",
        state.status === "idle"
          ? state.config.callToActionText
          : "Your microphone is only used during the call.",
      ),
    );
    return wrap;
  }

  function setStatus(status, detail) {
    state.status = status;
    state.statusDetail = detail || "";
    if (!state.config.headless) paint();
    emit("statusChange", { status: status, detail: state.statusDetail });
  }

  /* --------------------------------------------------------------- panel UX */

  function focusable() {
    if (!state.shadow) return [];
    return Array.prototype.slice.call(
      state.shadow.querySelectorAll("button:not([disabled])"),
    );
  }

  function onKeydown(event) {
    if (!state.open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key !== "Tab") return;
    // Without this the next Tab leaves the widget for the host page, which
    // strands keyboard users mid-call behind whatever the site renders next.
    var items = focusable();
    if (items.length === 0) return;
    var active = state.shadow.activeElement;
    var index = items.indexOf(active);
    var next = event.shiftKey ? index - 1 : index + 1;
    if (index === -1) return;
    if (next < 0 || next >= items.length) {
      event.preventDefault();
      items[next < 0 ? items.length - 1 : 0].focus();
    }
  }

  function openPanel() {
    if (state.open) return;
    state.open = true;
    state.lastFocus = document.activeElement;
    paint();
    document.addEventListener("keydown", onKeydown, true);
    var items = focusable();
    if (items.length > 0) items[items.length - 1].focus();
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;
    document.removeEventListener("keydown", onKeydown, true);
    paint();
    if (state.lastFocus && typeof state.lastFocus.focus === "function") {
      state.lastFocus.focus();
    }
  }

  function toggleMute() {
    if (!state.stream) return;
    state.muted = !state.muted;
    state.stream.getAudioTracks().forEach(function (track) {
      track.enabled = !state.muted;
    });
    paint();
  }

  /* ------------------------------------------------------------ audio meter */

  function startMeter() {
    if (state.meterRaf || !state.stream) return;
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      state.audioContext = new Context();
      state.localAnalyser = state.audioContext.createAnalyser();
      state.localAnalyser.fftSize = 256;
      state.audioContext
        .createMediaStreamSource(state.stream)
        .connect(state.localAnalyser);
      if (state.audioEl && state.audioEl.srcObject) {
        state.remoteAnalyser = state.audioContext.createAnalyser();
        state.remoteAnalyser.fftSize = 256;
        state.audioContext
          .createMediaStreamSource(state.audioEl.srcObject)
          .connect(state.remoteAnalyser);
      }
    } catch (error) {
      // Metering is decoration; a blocked AudioContext must not end the call.
      return;
    }

    var buffer = new Uint8Array(state.localAnalyser.frequencyBinCount);
    var lastPaint = 0;

    function level(analyser) {
      if (!analyser) return 0;
      analyser.getByteFrequencyData(buffer);
      var total = 0;
      for (var i = 0; i < buffer.length; i += 1) total += buffer[i];
      return total / buffer.length / 255;
    }

    function tick(now) {
      state.meterRaf = requestAnimationFrame(tick);
      if (now - lastPaint < 60) return;
      lastPaint = now;

      var remote = level(state.remoteAnalyser);
      var local = state.muted ? 0 : level(state.localAnalyser);
      var agentTalking = remote > 0.045;
      var next = agentTalking ? "speaking" : "listening";
      if (state.status === "listening" || state.status === "speaking") {
        if (state.status !== next) {
          state.status = next;
          if (!state.config.headless) paint();
        }
        paintBars(agentTalking ? remote : local);
        paintTimer();
      }
    }
    state.meterRaf = requestAnimationFrame(tick);
  }

  function paintBars(amplitude) {
    if (!state.shadow) return;
    var bars = state.shadow.querySelectorAll(".meter i");
    if (bars.length === 0) return;
    var peak = Math.min(1, amplitude * 3.4);
    for (var i = 0; i < bars.length; i += 1) {
      var distance = Math.abs(i - (bars.length - 1) / 2) / ((bars.length - 1) / 2);
      var height = 3 + peak * 30 * (1 - distance * 0.7) * (0.65 + Math.random() * 0.35);
      bars[i].style.height = Math.max(3, Math.round(height)) + "px";
    }
  }

  function paintTimer() {
    if (!state.shadow || !state.callStartedAt) return;
    var node = state.shadow.querySelector(".timer");
    if (node) {
      node.textContent = formatDuration(
        Math.round((Date.now() - state.callStartedAt) / 1000),
      );
    }
  }

  function stopMeter() {
    if (state.meterRaf) cancelAnimationFrame(state.meterRaf);
    state.meterRaf = null;
    state.localAnalyser = null;
    state.remoteAnalyser = null;
    if (state.audioContext) {
      state.audioContext.close().catch(function () {});
      state.audioContext = null;
    }
  }

  /* ------------------------------------------------------------------- call */

  var MIC_ERRORS = {
    NotAllowedError:
      "Microphone access was blocked. Allow it in your browser's address bar, then try again.",
    PermissionDeniedError:
      "Microphone access was blocked. Allow it in your browser's address bar, then try again.",
    NotFoundError: "No microphone was found. Connect one and try again.",
    DevicesNotFoundError: "No microphone was found. Connect one and try again.",
    NotReadableError: "Another app is using your microphone. Close it and try again.",
    TrackStartError: "Another app is using your microphone. Close it and try again.",
  };

  async function startCall() {
    if (state.status === "connecting" || state.pc) return;
    state.graceful = false;
    state.muted = false;
    setStatus("connecting", "Setting up a secure connection.");
    emit("callStart", {});

    try {
      await initializeSession();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "This browser cannot make voice calls. Try Chrome, Edge, Safari or Firefox.",
        );
      }
      setStatus("connecting", "Waiting for microphone permission.");
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (micError) {
        throw new Error(
          MIC_ERRORS[micError && micError.name] ||
            "The microphone could not be started. Check your browser settings and try again.",
        );
      }

      setStatus("connecting", "Connecting you to " + state.config.agentName + ".");
      createPeerConnection();
      await connectSignaling();
      await negotiate();
    } catch (error) {
      teardown();
      setStatus(
        "failed",
        (error && error.message) ||
          "Something went wrong starting the call. Please try again.",
      );
      emit("error", error);
    }
  }

  async function initializeSession() {
    var response = await fetch(
      state.config.apiBaseUrl + "/api/v1/public/embed/init",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: state.config.token,
          context_variables: state.config.contextVariables,
        }),
      },
    ).catch(function () {
      throw new Error("The voice service is unreachable. Please try again shortly.");
    });

    if (!response.ok) {
      var detail = await response.json().catch(function () {
        return null;
      });
      throw new Error(
        (detail && detail.detail) ||
          "This voice widget is not accepting calls right now.",
      );
    }

    var data = await response.json();
    state.sessionToken = data.session_token;
    state.workflowRunId = data.workflow_run_id;
    state.workflowId = (data.config && data.config.workflow_id) || state.config.workflowId;
    await fetchTurnCredentials();
  }

  async function fetchTurnCredentials() {
    try {
      var response = await fetch(
        state.config.apiBaseUrl +
          "/api/v1/public/embed/turn-credentials/" +
          state.sessionToken,
        { method: "GET", headers: { "Content-Type": "application/json" } },
      );
      if (response.ok) state.turn = await response.json();
    } catch (error) {
      // STUN-only still works on many networks, so this is not fatal.
      console.warn("Harkbell widget: continuing without TURN.", error);
    }
  }

  function createPeerConnection() {
    var iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
    if (state.turn && state.turn.uris && state.turn.uris.length > 0) {
      iceServers.push({
        urls: state.turn.uris,
        username: state.turn.username,
        credential: state.turn.password,
      });
    }

    state.pc = new RTCPeerConnection({ iceServers: iceServers });
    state.stream.getTracks().forEach(function (track) {
      state.pc.addTrack(track, state.stream);
    });

    state.pc.ontrack = function (event) {
      if (event.track.kind === "audio" && state.audioEl) {
        state.audioEl.srcObject = event.streams[0];
        var play = state.audioEl.play();
        if (play && typeof play.catch === "function") {
          play.catch(function () {
            setStatus(
              state.status,
              "Your browser blocked audio playback. Click anywhere on the page to hear the agent.",
            );
          });
        }
      }
    };
    state.pc.oniceconnectionstatechange = onPeerState;
    state.pc.onconnectionstatechange = onPeerState;
    state.pc.onicecandidate = function (event) {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      state.ws.send(
        JSON.stringify({
          type: "ice-candidate",
          payload: {
            candidate: event.candidate
              ? {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                }
              : null,
            pc_id: state.pcId,
          },
        }),
      );
    };
  }

  function onPeerState() {
    var pc = state.pc;
    if (!pc) return;
    var ice = pc.iceConnectionState;

    if (pc.connectionState === "connected" || ice === "connected" || ice === "completed") {
      if (!state.callStartedAt) {
        state.callStartedAt = Date.now();
        setStatus("listening", "Go ahead — " + state.config.agentName + " is listening.");
        startMeter();
        emit("callConnected", {
          workflowId: state.workflowId,
          workflowRunId: state.workflowRunId,
        });
      }
      return;
    }

    if (pc.connectionState === "failed" || ice === "failed") {
      stopCall({
        graceful: false,
        status: "failed",
        detail:
          "The connection dropped. This is usually a network or firewall problem — try again.",
      });
      return;
    }

    if (ice === "closed" || ice === "disconnected" || pc.connectionState === "closed") {
      stopCall({ graceful: true, status: "ended", detail: "The call ended." });
    }
  }

  function connectSignaling() {
    return new Promise(function (resolve, reject) {
      var url =
        state.config.apiBaseUrl.replace(/^http/, "ws") +
        "/api/v1/ws/public/signaling/" +
        state.sessionToken;
      state.pcId = peerId();
      var socket = new WebSocket(url);
      state.ws = socket;

      var settled = false;
      socket.onopen = function () {
        settled = true;
        resolve();
      };
      socket.onerror = function () {
        if (!settled) {
          settled = true;
          reject(new Error("Could not reach the voice service. Please try again."));
        }
      };
      socket.onclose = function (event) {
        state.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error("The voice service closed the connection."));
          return;
        }
        if (event.reason === "call ended") {
          stopCall({
            graceful: true,
            status: "ended",
            detail: "The call ended.",
            closeSocket: false,
          });
          return;
        }
        if (state.callStartedAt && !state.graceful) {
          stopCall({
            graceful: false,
            status: "failed",
            detail: "The connection dropped. Please try again.",
            closeSocket: false,
          });
        }
      };
      socket.onmessage = function (event) {
        handleSignal(event).catch(function (error) {
          console.error("Harkbell widget: signalling error", error);
        });
      };
    });
  }

  async function handleSignal(event) {
    var message = JSON.parse(event.data);
    if (message.type === "answer") {
      await state.pc.setRemoteDescription({
        type: "answer",
        sdp: message.payload.sdp,
      });
      return;
    }
    if (message.type === "ice-candidate") {
      var candidate = message.payload && message.payload.candidate;
      if (!candidate || !state.pc) return;
      await state.pc
        .addIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        })
        .catch(function (error) {
          console.warn("Harkbell widget: rejected ICE candidate", error);
        });
      return;
    }
    if (message.type === "error") {
      stopCall({
        graceful: false,
        status: "failed",
        detail:
          (message.payload && message.payload.message) ||
          "The voice service reported an error.",
      });
      return;
    }
    if (message.type === "call-ended") {
      stopCall({ graceful: true, status: "ended", detail: "The call ended." });
    }
  }

  async function negotiate() {
    var offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);
    state.ws.send(
      JSON.stringify({
        type: "offer",
        payload: {
          sdp: offer.sdp,
          type: "offer",
          pc_id: state.pcId,
          workflow_id: parseInt(state.workflowId, 10),
          workflow_run_id: parseInt(state.workflowRunId, 10),
          call_context_vars: state.config.contextVariables || {},
        },
      }),
    );
  }

  /** Releases every resource without touching status, so callers control the UI. */
  function teardown(options) {
    var closeSocket = !options || options.closeSocket !== false;
    stopMeter();
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    if (state.stream) {
      state.stream.getTracks().forEach(function (track) {
        track.stop();
      });
      state.stream = null;
    }
    if (state.pc) {
      var pc = state.pc;
      state.pc = null;
      if (pc.signalingState !== "closed") pc.close();
    }
    if (state.ws) {
      var socket = state.ws;
      state.ws = null;
      if (
        closeSocket &&
        socket.readyState !== WebSocket.CLOSED &&
        socket.readyState !== WebSocket.CLOSING
      ) {
        socket.close();
      }
    }
    if (state.audioEl) state.audioEl.srcObject = null;
    state.sessionToken = null;
    state.turn = null;
    state.muted = false;
  }

  function stopCall(options) {
    var settings = options || {};
    state.graceful = settings.graceful !== false;

    if (state.callStartedAt) {
      emit("callDisconnected", {
        workflowId: state.workflowId,
        workflowRunId: state.workflowRunId,
        durationSeconds: Math.round((Date.now() - state.callStartedAt) / 1000),
      });
    }
    state.callStartedAt = null;

    teardown({ closeSocket: settings.closeSocket !== false });
    setStatus(settings.status || "ended", settings.detail || "The call ended.");
    emit("callEnd", {});
  }

  function peerId() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return (
      "PC-" +
      Array.prototype.map
        .call(bytes, function (byte) {
          return byte.toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  // A call left running when the tab closes keeps a Dograh run open and bills
  // for silence, so end it explicitly.
  window.addEventListener("pagehide", function () {
    if (state.pc) stopCall({ graceful: true });
  });

  var api = {
    init: init,
    start: startCall,
    stop: stopCall,
    end: stopCall,
    open: openPanel,
    close: closePanel,
    mute: toggleMute,
    getState: function () {
      return { status: state.status, muted: state.muted, open: state.open };
    },
    onReady: function (fn) {
      state.callbacks.ready = fn;
    },
    onCallStart: function (fn) {
      state.callbacks.callStart = fn;
    },
    onCallConnected: function (fn) {
      state.callbacks.callConnected = fn;
    },
    onCallDisconnected: function (fn) {
      state.callbacks.callDisconnected = fn;
    },
    onCallEnd: function (fn) {
      state.callbacks.callEnd = fn;
    },
    onStatusChange: function (fn) {
      state.callbacks.statusChange = fn;
    },
    onError: function (fn) {
      state.callbacks.error = fn;
    },
  };

  window.VocalonixWidget = api;
  // Snippets published before this widget existed call window.DograhWidget.
  if (!window.DograhWidget) window.DograhWidget = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
