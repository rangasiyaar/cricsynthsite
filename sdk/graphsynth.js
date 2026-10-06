/*!
 * GraphSynth broadcast SDK — https://cricsynthesis.in/sdk/
 * Mounts a live GraphSynth graphic into any element and keeps it current.
 * No dependencies. Works in browsers, OBS / vMix browser sources and CasparCG HTML templates.
 *
 *   const g = GraphSynth.mount(document.getElementById("wp"), {
 *     apiKey: "cs_live_…",            // use a dedicated key for each broadcast machine
 *     graphic: "win-probability",     // win-probability | score-projection | manhattan | worm | phases | player-form
 *     matchId: "ipl-2026-m042",       // or playerId for player-form
 *     theme: "transparent",           // broadcast_dark | broadcast_light | transparent
 *     refreshSeconds: 10,
 *     fonts: true,                    // load Barlow from Google Fonts (set false to self-host)
 *   });
 *   g.refresh();  g.stop();
 */
(function (root) {
  "use strict";

  var DEFAULT_API = "https://api.cricsynthesis.in";
  var GRAPHICS = ["win-probability", "score-projection", "manhattan", "worm", "phases", "player-form"];
  var LIVE = { "win-probability": true, "score-projection": true };

  function buildUrl(o) {
    var q = new URLSearchParams({ format: "svg", raw: "true", theme: o.theme || "broadcast_dark" });
    if (o.graphic === "player-form") q.set("player_id", o.playerId); else q.set("match_id", o.matchId);
    if (o.homeColor) q.set("home_color", o.homeColor);
    if (o.awayColor) q.set("away_color", o.awayColor);
    if (o.width) q.set("width", String(o.width));
    if (o.height) q.set("height", String(o.height));
    return (o.apiBase || DEFAULT_API).replace(/\/$/, "") + "/v2/graphics/" + o.graphic + "?" + q.toString();
  }

  // Graphics are drawn in Barlow / Barlow Condensed; load them once so live SVG matches the PNGs.
  function ensureFonts() {
    if (typeof document === "undefined" || document.getElementById("graphsynth-fonts")) return;
    var l = document.createElement("link");
    l.id = "graphsynth-fonts";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow:wght@500;600&family=Barlow+Condensed:wght@600&display=swap";
    document.head.appendChild(l);
  }

  function mount(el, opts) {
    if (!el) throw new Error("GraphSynth.mount: element not found");
    if (!(opts && opts.fonts === false)) ensureFonts();
    var o = Object.assign({ refreshSeconds: LIVE[opts && opts.graphic] ? 10 : 0 }, opts || {});
    if (!o.apiKey) throw new Error("GraphSynth.mount: apiKey is required");
    if (GRAPHICS.indexOf(o.graphic) < 0) throw new Error("GraphSynth.mount: unknown graphic " + o.graphic);
    if (o.graphic === "player-form" ? !o.playerId : !o.matchId) {
      throw new Error("GraphSynth.mount: " + (o.graphic === "player-form" ? "playerId" : "matchId") + " is required");
    }

    var url = buildUrl(o), last = "", timer = null, stopped = false, failures = 0;

    function schedule() {
      if (stopped || !o.refreshSeconds) return;
      // back off on repeated errors (max 2 minutes), never hammer the API
      var delay = Math.min(120, o.refreshSeconds * Math.pow(2, Math.min(failures, 4))) * 1000;
      timer = setTimeout(tick, delay);
    }

    function tick() {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) { schedule(); return; }
      fetch(url, { headers: { "X-API-Key": o.apiKey }, cache: "no-store" })
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (b) {
              var err = new Error(b.detail || ("HTTP " + res.status));
              err.status = res.status;
              throw err;
            });
          }
          return res.text();
        })
        .then(function (svg) {
          failures = 0;
          if (svg !== last) {                 // only touch the DOM when the picture changed
            last = svg;
            el.innerHTML = svg;
            var s = el.querySelector("svg");
            if (s) { s.setAttribute("width", "100%"); s.setAttribute("height", "100%"); }
            if (o.onUpdate) o.onUpdate(svg);
          }
        })
        .catch(function (err) {
          failures += 1;
          if (o.onError) o.onError(err); else if (root.console) console.warn("GraphSynth:", err.message);
          if (err.status === 401 || err.status === 403) stopped = true;   // bad key / plan: stop polling
        })
        .then(schedule);
    }

    tick();
    return {
      refresh: function () { clearTimeout(timer); tick(); },
      stop: function () { stopped = true; clearTimeout(timer); },
    };
  }

  root.GraphSynth = { mount: mount, url: buildUrl, version: "1.0.0" };
})(typeof window !== "undefined" ? window : this);
