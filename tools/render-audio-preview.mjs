/** ChromeのOfflineAudioContextでゲーム本体と同じ音源をWAV化する。追加依存なし。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.tmp', 'audio-preview');
fs.mkdirSync(output, { recursive: true });
const browser = [process.env.ROGUE_AUDIO_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(candidate => candidate && fs.existsSync(candidate));
if (!browser) throw new Error('Chrome/Edgeが見つからない。ROGUE_AUDIO_BROWSERに実行ファイルを指定してください。');
const seconds = Number(process.argv[2]) || 24;
const html = `<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>
<script type="module">
import { soundEngine, parseMusicScore } from ${JSON.stringify(pathToFileURL(path.join(root, 'soundEngine.js')).href)};
import { ALL_BGM_TRACKS, ALL_SE_LIST } from ${JSON.stringify(pathToFileURL(path.join(root, 'musicData.js')).href)};
const sampleRate = 32000;
function engineFor(context) {
  const engine = new soundEngine.constructor();
  // 書き出しは全SEを未来へ一括予約するので、実時間向けの同時発音上限を使わない。
  engine.maxSeSources = Infinity;
  engine.ctx = context;
  engine.bgmGain = context.createGain(); engine.bgmGain.gain.value = engine.bgmVolume; engine.bgmGain.connect(context.destination);
  engine.seGain = context.createGain(); engine.seGain.gain.value = engine.seVolume; engine.seGain.connect(context.destination);
  engine.noiseBuffer = context.createBuffer(1, sampleRate * 2, sampleRate);
  const data = engine.noiseBuffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
  return engine;
}
function wav(buffer) {
  const size = buffer.length * 4, bytes = new ArrayBuffer(44 + size), view = new DataView(bytes);
  const string = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  string(0, 'RIFF'); view.setUint32(4, 36 + size, true); string(8, 'WAVE'); string(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true); string(36, 'data'); view.setUint32(40, size, true);
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let peak = 0, sum = 0, clipped = 0;
  for (let i = 0; i < buffer.length; i++) for (let ch = 0; ch < 2; ch++) {
    const value = channels[ch][i]; peak = Math.max(peak, Math.abs(value)); sum += value * value;
    if (Math.abs(value) >= 1) clipped++;
    view.setInt16(44 + (i * 2 + ch) * 2, Math.max(-1, Math.min(1, value)) * 32767, true);
  }
  let binary = ''; const data = new Uint8Array(bytes);
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return { base64: btoa(binary), seconds: buffer.duration, peak, rms: Math.sqrt(sum / (buffer.length * 2)), clipped };
}
async function run() {
  const results = [];
  for (const score of ALL_BGM_TRACKS) {
    const tracks = parseMusicScore(score), total = Math.max(...tracks.map(track => track.steps.length));
    const stepDuration = 60 / score.tempo / 4;
    const duration = score.loop === false ? total * stepDuration + 0.4 : Math.min(${seconds}, total * stepDuration);
    const context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const engine = engineFor(context); engine.parsedTracks = tracks; engine.secondsPerStep = stepDuration;
    const count = score.loop === false ? total : Math.ceil((duration - 0.05) / stepDuration);
    for (let step = 0; step < count; step++) engine._playStepAt(step % total, 0.025 + step * stepDuration);
    if (score.loop !== false) {
      engine.bgmGain.gain.setValueAtTime(engine.bgmVolume, duration - 0.35);
      engine.bgmGain.gain.linearRampToValueAtTime(0, duration - 0.01);
    }
    results.push({ file: score.name + '.wav', title: score.title, ...wav(await context.startRendering()) });
  }
  const duration = ALL_SE_LIST.length * 0.8 + 0.6;
  const context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate), engine = engineFor(context);
  for (let i = 0; i < ALL_SE_LIST.length; i++) {
    const offset = i * 0.8;
    const tone = engine._playTone.bind(engine), noise = engine._playNoise.bind(engine);
    engine._playTone = options => tone({ ...options, start: (options.start || 0) + offset });
    engine._playNoise = options => noise({ ...options, start: (options.start || 0) + offset });
    engine.playSE(ALL_SE_LIST[i].id);
    engine._playTone = tone; engine._playNoise = noise;
  }
  const rendered = await context.startRendering();
  const samples = rendered.getChannelData(0);
  const segments = ALL_SE_LIST.map((se, index) => {
    let energy = 0;
    const start = Math.floor(index * 0.8 * sampleRate), end = Math.floor((index * 0.8 + 0.65) * sampleRate);
    for (let frame = start; frame < end; frame++) energy += samples[frame] * samples[frame];
    return { id: se.id, rms: Math.sqrt(energy / (end - start)) };
  });
  if (segments.some(segment => segment.rms < 0.0001)) throw new Error('SE一覧に無音の区間がある');
  results.push({ file: 'se-montage.wav', title: '効果音一覧', order: ALL_SE_LIST.map(se => se.name), segments, ...wav(rendered) });
  return results;
}
try { document.querySelector('#result').textContent = JSON.stringify(await run()); }
catch (error) { document.querySelector('#result').textContent = JSON.stringify({ error: error.stack }); }
</script>`;
const htmlPath = path.join(output, 'render.html');
fs.writeFileSync(htmlPath, html);
const profile = path.join(output, 'browser-profile');
const portFile = path.join(profile, 'DevToolsActivePort');
if (fs.existsSync(portFile)) fs.unlinkSync(portFile);
const child = spawn(browser, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--disable-background-networking', '--mute-audio', '--allow-file-access-from-files',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', pathToFileURL(htmlPath).href],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let errors = '', socket, resultText;
child.stderr.on('data', data => { errors += data.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const start = Date.now();
  while (!fs.existsSync(portFile)) {
    if (child.exitCode !== null || Date.now() - start > 10000) throw new Error(`ブラウザ起動失敗: ${errors.slice(-1200)}`);
    await sleep(100);
  }
  const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(entry => entry.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); callback(message.result); }
  };
  const call = (method, params = {}) => new Promise(resolve => {
    const request = ++id; pending.set(request, resolve); socket.send(JSON.stringify({ id: request, method, params }));
  });
  while (Date.now() - start < 90000) {
    const result = await call('Runtime.evaluate', { expression: 'document.querySelector("#result")?.textContent', returnByValue: true });
    resultText = result?.result?.value;
    if (resultText && resultText !== 'pending') break;
    await sleep(100);
  }
  if (!resultText || resultText === 'pending') throw new Error(`音声の書き出しが完了しなかった: ${errors.slice(-1200)}`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
  await sleep(300);
  socket?.close();
  if (child.exitCode === null) child.kill();
}
const results = JSON.parse(resultText);
if (results.error) throw new Error(results.error);
for (const result of results) {
  if (result.clipped || result.rms < 0.001) throw new Error(`${result.file}: 音割れまたは無音`);
  fs.writeFileSync(path.join(output, result.file), Buffer.from(result.base64, 'base64'));
  delete result.base64;
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
