// audio.js — fully synthesized WebAudio sound for Solmar Bay.
// No audio files: every sound is built from oscillators and filtered
// noise, so the game ships zero media and never touches the network.

export function createAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    master: null,
  };

  audio.init = () => {
    if (audio.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      // engine hum: two detuned saws through a lowpass, pitch follows speed
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      const engineOsc2 = audio.ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.7;
      const lp = audio.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 480;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0.0;
      audio.engineOsc.connect(lp);
      engineOsc2.connect(lp);
      lp.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      engineOsc2.start();
      audio.engineOsc2 = engineOsc2;
      // police siren: one sine that wails between two tones
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0.0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
    } catch (e) {
      audio.ctx = null;
    }
  };

  audio.resume = () => { if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume(); };

  audio.setMuted = (m) => {
    audio.muted = m;
    if (audio.master) audio.master.gain.value = m ? 0 : 0.5;
  };

  // called every frame: engine pitch by speed, siren wail while wanted
  audio.update = (speedMph, wanted, dt) => {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    if (audio.engineGain) {
      const target = speedMph > 1 ? 0.05 + Math.min(0.09, speedMph / 900) : 0.0;
      audio.engineGain.gain.setTargetAtTime(target, t, 0.08);
      const f = 48 + speedMph * 1.6;
      audio.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
      audio.engineOsc2.frequency.setTargetAtTime(f * 1.012, t, 0.08);
    }
    if (audio.sirenGain) {
      if (wanted > 0) {
        audio.sirenTimer += dt;
        const hi = Math.floor(audio.sirenTimer / 0.55) % 2 === 0;
        audio.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 620, t, 0.05);
        audio.sirenGain.gain.setTargetAtTime(0.045, t, 0.1);
      } else {
        audio.sirenGain.gain.setTargetAtTime(0.0, t, 0.2);
      }
    }
  };

  function blip(freq, dur, type, vol, slideTo) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * dur);
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buf;
    const f = audio.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1800;
    const g = audio.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(audio.master);
    src.start(t);
  }

  audio.click = () => blip(660, 0.07, 'square', 0.12);
  audio.pickup = () => { blip(880, 0.12, 'sine', 0.22, 1320); };
  audio.coin = () => { blip(1180, 0.09, 'sine', 0.2); setTimeout(() => blip(1560, 0.14, 'sine', 0.2), 80); };
  audio.gunshot = () => noiseBurst(0.16, 0.4, 2400);
  audio.crash = () => noiseBurst(0.3, 0.35, 700);
  audio.steal = () => { blip(220, 0.18, 'square', 0.16, 110); };
  audio.busted = () => { blip(392, 0.25, 'sawtooth', 0.2, 196); setTimeout(() => blip(311, 0.4, 'sawtooth', 0.2), 220); };
  audio.missionDone = () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
  };
  audio.missionStart = () => { blip(440, 0.15, 'triangle', 0.2, 660); };
  return audio;
}
