(function (root) {
  "use strict";

  const assetUrl = (path) => {
    const embedded = root.DabaoAssetUrl?.(path);
    if (embedded && embedded !== path) return embedded;
    return path === "voice/background.mp3" ? "voice/background.m4a?v=20261022k" : path;
  };

  class GameAudio {
    constructor(AudioType = root.Audio) {
      this.bgm = new AudioType(assetUrl("voice/background.mp3"));
      this.bgm.loop = true;
      this.bgm.volume = 0.24;
      this.bgm.preload = "auto";
      this.bgmRetryTimer = null;
      this.bgmRetryCount = 0;
      this.bgmPlayAttempt = 0;
      this.bgm.addEventListener("playing", () => {
        this.clearBackgroundRetry();
        this.bgmRetryCount = 0;
      });
      this.bgm.addEventListener("canplay", () => this.ensureBackground());
      this.bgm.addEventListener("error", () => this.queueBackgroundRetry());
      this.bgm.addEventListener("stalled", () => this.queueBackgroundRetry(5000));
      this.bgm.addEventListener("waiting", () => this.queueBackgroundRetry(5000));

      this.bossCueAsset = assetUrl("voice/dabao1.mp3");
      this.bossCue = new AudioType(this.bossCueAsset);
      this.bossCue.volume = 0.9;
      this.bossCue.preload = "auto";
      this.bossCue.addEventListener("ended", () => {
        if (this.bossCue.ended) this.completeBossCue();
      });
      this.bossCue.addEventListener("error", () => {
        if (this.bossCue.error) this.completeBossCue();
      });

      this.slashAsset = assetUrl("voice/slash.wav");
      this.slash = new AudioType(this.slashAsset);
      this.slash.volume = 0.95;
      this.slash.preload = "auto";

      this.voice = new AudioType();
      this.voice.volume = 0.95;
      this.voice.preload = "auto";
      this.voice.addEventListener("ended", () => {
        if (this.voice.ended) this.playNext();
      });
      this.voice.addEventListener("error", () => {
        if (this.voice.error) this.playNext();
      });

      this.queue = [];
      this.voicePlaying = false;
      this.currentVoiceFile = null;
      this.playbackId = 0;
      this.bossCuePlaying = false;
      this.bossCueDone = null;
      this.bossCueId = 0;
      this.inGame = false;
      this.muted = false;
      root.document?.addEventListener?.("visibilitychange", () => {
        if (!root.document.hidden) this.ensureBackground();
      });
    }

    clearBackgroundRetry() {
      if (this.bgmRetryTimer !== null) clearTimeout(this.bgmRetryTimer);
      this.bgmRetryTimer = null;
    }

    queueBackgroundRetry(minDelay = 0) {
      if (!this.inGame || this.muted || this.bgmRetryTimer !== null || this.bgmRetryCount >= 3) return;
      const delay = Math.max(minDelay, 800 * 2 ** this.bgmRetryCount);
      this.bgmRetryCount += 1;
      this.bgmRetryTimer = setTimeout(() => {
        this.bgmRetryTimer = null;
        if (!this.inGame || this.muted) return;
        if (this.bgm.error || (typeof this.bgm.readyState === "number" && this.bgm.readyState < 2)) {
          try { this.bgm.load?.(); } catch (_) { /* A later user click can retry playback. */ }
        }
        this.ensureBackground(true);
      }, delay);
    }

    ensureBackground(force = false) {
      if (!this.inGame || this.muted || (!force && this.bgm.paused === false && !this.bgm.error)) return;
      const attempt = ++this.bgmPlayAttempt;
      this.play(this.bgm, () => {
        if (attempt === this.bgmPlayAttempt) this.queueBackgroundRetry();
      });
    }

    prepareAssets() {
      const bossCueAsset = assetUrl("voice/dabao1.mp3");
      if (bossCueAsset !== this.bossCueAsset) {
        this.bossCueAsset = bossCueAsset;
        this.bossCue.src = bossCueAsset;
      }
      const slashAsset = assetUrl("voice/slash.wav");
      if (slashAsset !== this.slashAsset) {
        this.slashAsset = slashAsset;
        this.slash.src = slashAsset;
      }
    }

    play(audio, onFailure) {
      try {
        const result = audio.play();
        if (result && typeof result.catch === "function") result.catch(() => onFailure?.());
      } catch (_) {
        onFailure?.();
      }
    }

    start() {
      this.stop();
      this.inGame = true;
      this.bgmRetryCount = 0;
      this.bgm.currentTime = 0;
      this.ensureBackground();
    }

    stop() {
      this.inGame = false;
      this.clearBackgroundRetry();
      this.bgmPlayAttempt += 1;
      this.bgm.pause();
      this.bossCue.pause();
      this.slash.pause();
      this.bossCuePlaying = false;
      this.bossCueDone = null;
      this.bossCueId += 1;
      this.voice.pause();
      this.queue = [];
      this.voicePlaying = false;
      this.currentVoiceFile = null;
      this.playbackId += 1;
    }

    playCard(key) {
      if (key && this.inGame) this.interruptWith([`${key}.mp3`]);
    }

    playSlash() {
      if (!this.inGame || this.muted) return;
      this.slash.pause();
      this.slash.currentTime = 0;
      this.play(this.slash);
    }

    playBossTurn() {
      if (!this.inGame) return;
      this.bossCue.pause();
      this.bossCue.currentTime = 0;
      this.bossCueDone = null;
      const cueId = ++this.bossCueId;
      this.bossCuePlaying = !this.muted;
      if (this.bossCuePlaying) this.play(this.bossCue, () => {
        if (cueId === this.bossCueId) this.completeBossCue();
      });
    }

    afterBossTurn(callback) {
      if (this.bossCuePlaying) this.bossCueDone = callback;
      else callback();
    }

    completeBossCue() {
      if (!this.bossCuePlaying) return;
      this.bossCuePlaying = false;
      const done = this.bossCueDone;
      this.bossCueDone = null;
      done?.();
    }

    playBossKill() {
      if (!this.inGame) return;
      this.inGame = false;
      this.bgm.pause();
      this.bossCue.pause();
      this.slash.pause();
      this.bossCuePlaying = false;
      this.bossCueDone = null;
      this.bossCueId += 1;
      this.interruptWith(["dabaokill.mp3"]);
    }

    interruptWith(files) {
      this.voice.pause();
      this.voice.currentTime = 0;
      this.playbackId += 1;
      this.voicePlaying = false;
      this.currentVoiceFile = null;
      this.queue = this.muted ? [] : files.slice();
      this.playNext();
    }

    playNext() {
      this.voicePlaying = false;
      if (this.muted || !this.queue.length) {
        this.currentVoiceFile = null;
        return;
      }
      const file = this.queue.shift();
      this.currentVoiceFile = file;
      this.voice.src = assetUrl(`voice/${file}`);
      this.voice.currentTime = 0;
      this.voicePlaying = true;
      const playbackId = ++this.playbackId;
      this.play(this.voice, () => {
        if (this.playbackId === playbackId) this.playNext();
      });
    }

    finish(result, mode, { afterBossKill = false, humanPlayerId = 1 } = {}) {
      this.inGame = false;
      this.bgm.pause();
      this.bossCue.pause();
      this.slash.pause();
      this.bossCuePlaying = false;
      this.bossCueDone = null;
      this.bossCueId += 1;
      if (result.kind === "draw") {
        this.interruptWith([]);
        return;
      }
      const files = mode === "solo"
        ? [result.winners.includes(humanPlayerId) ? "victory.mp3" : "fail.mp3"]
        : result.winners.length < 4 ? ["victory.mp3", "fail.mp3"] : ["victory.mp3"];
      if (afterBossKill && this.voicePlaying && this.currentVoiceFile === "dabaokill.mp3") {
        this.queue = this.muted ? [] : files;
      } else this.interruptWith(files);
    }

    setMuted(muted) {
      this.muted = Boolean(muted);
      if (this.muted) {
        this.clearBackgroundRetry();
        this.bgmPlayAttempt += 1;
        this.bgm.pause();
        this.bossCue.pause();
        this.slash.pause();
        this.completeBossCue();
        this.voice.pause();
        this.queue = [];
        this.voicePlaying = false;
        this.currentVoiceFile = null;
        this.playbackId += 1;
      } else if (this.inGame) {
        this.bgmRetryCount = 0;
        this.ensureBackground();
      }
    }
  }

  const api = { GameAudio };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoAudio = api;
})(typeof window !== "undefined" ? window : globalThis);
