import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeLocalAiInput, listLocalModels, preloadLocalModel,
  reviewLocalCandidate,
  validLocalAiConfig } from './local-ai.js';

const bars = Array.from({ length: 20 }, (_, index) => ({
  time: index * 60000, end: (index + 1) * 60000 - 1,
  open: 100, high: 101, low: 99, close: 100, volume: 10
}));
const signal = { id: 'one', market: 'futures', symbol: 'BTCUSDT', timeframe: '15m',
  strategyVersion: 4, strategyKey: 'smc', side: 'LONG', entryMode: 'LIMIT',
  detectedAt: bars.at(-1).end, entry: 100, stop: 98, targets: [102,104,106],
  features: [1, 0, 1] };

test('local AI input freezes only candles closed before candidate creation', () => {
  const frozen = freezeLocalAiInput(signal, bars, bars.slice(0, 12));
  assert.equal(frozen.hash.length, 64);
  assert.equal(JSON.parse(frozen.prompt).workingClosedBars.length, 20);
  assert.throws(() => freezeLocalAiInput(signal,
    [...bars.slice(0, -1), { ...bars.at(-1), end: signal.detectedAt + 1 }],
    bars.slice(0, 12)), /закрытый/);
});

test('Ollama response is structured and uncalibrated', async () => {
  const frozen = freezeLocalAiInput(signal, bars, bars.slice(0, 12));
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({
      response: JSON.stringify({ verdict: 'REJECT', reason: 'Слабая структура' }) }) };
  };
  const result = await reviewLocalCandidate(
    { enabled: true, provider: 'ollama', model: 'qwen3:4b' }, frozen, fetcher);
  assert.equal(result.verdict, 'REJECT');
  assert.equal(result.inputHash, frozen.hash);
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(calls[0].body.stream, false);
  assert.deepEqual(calls[0].body.format.properties.verdict.enum,
    ['PASS', 'REJECT', 'UNSURE']);
  assert.ok(!Object.hasOwn(result, 'probability'));
});

test('local model lists and malformed answers fail closed', async () => {
  const models = await listLocalModels('lmstudio', async () => ({ ok: true,
    json: async () => ({ data: [{ id: 'gemma-3n' }, { id: 'bad model' }] }) }));
  assert.deepEqual(models, ['gemma-3n']);
  const frozen = freezeLocalAiInput(signal, bars, bars.slice(0, 12));
  await assert.rejects(reviewLocalCandidate(
    { enabled: true, provider: 'lmstudio', model: 'gemma-3n' }, frozen,
    async () => ({ ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ verdict: 'BUY', reason: 'уверен' }) } }] }) })),
  /неверную оценку/);
  assert.equal(validLocalAiConfig({ enabled: true, provider: 'ollama',
    model: 'https://foreign.example' }), false);
});

test('selected Ollama model is preloaded and retained for later candidates', async () => {
  const calls = [];
  const config = { enabled: true, provider: 'ollama', model: 'qwen3:4b' };
  await preloadLocalModel(config, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true };
  });
  assert.equal(calls[0].prompt, '');
  assert.equal(calls[0].keep_alive, -1);
  const frozen = freezeLocalAiInput(signal, bars, bars.slice(0, 12));
  await reviewLocalCandidate(config, frozen, async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({
      response: JSON.stringify({ verdict: 'UNSURE', reason: 'Мало подтверждений' }) }) };
  });
  assert.equal(calls[1].keep_alive, -1);
});
