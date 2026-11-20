const FEATURE_COUNT = 8;
const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))));
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export function newModel() {
  return { version: 2, weights: Array(FEATURE_COUNT).fill(0), samples: 0, successes: 0, walkForward: [] };
}

export function validModel(model) {
  return model?.version === 2 && Array.isArray(model.weights) && model.weights.length === FEATURE_COUNT &&
    model.weights.every(Number.isFinite) && Number.isSafeInteger(model.samples) && model.samples >= 0 &&
    Number.isSafeInteger(model.successes) && model.successes >= 0 && model.successes <= model.samples &&
    Array.isArray(model.walkForward);
}

export function modelTrusted(model) {
  if (!validModel(model) || model.samples < 50 || model.walkForward.length < 30) return false;
  const recent = model.walkForward.slice(-40);
  const modelBrier = recent.reduce((sum, item) => sum + (item.prediction - item.label) ** 2, 0) / recent.length;
  const baselineBrier = recent.reduce((sum, item) => sum + (item.baseline - item.label) ** 2, 0) / recent.length;
  return modelBrier < baselineBrier * 0.95;
}

export function modelSummary(model) {
  if (!validModel(model)) return null;
  const recent = model.walkForward.slice(-40);
  const mean = key => recent.length ? recent.reduce((sum, item) => sum + (item[key] - item.label) ** 2, 0) / recent.length : null;
  return { samples: model.samples, successRate: model.samples ? model.successes / model.samples : null,
    validationSamples: recent.length, modelBrier: mean('prediction'), baselineBrier: mean('baseline'), trusted: modelTrusted(model) };
}

export function scoreSignal(model, features) {
  if (!validModel(model) || !Array.isArray(features) || features.length !== FEATURE_COUNT || !features.every(Number.isFinite)) return null;
  const z = model.weights.reduce((sum, weight, i) => sum + weight * features[i], 0);
  const probability = clamp(sigmoid(z), 0.05, 0.95);
  const baseline = (model.successes + 2) / (model.samples + 4);
  const trusted = modelTrusted(model);
  return { probability, baseline, trainedSamples: model.samples, trusted, recommended: !trusted || probability >= 0.55 };
}

export function learnFromOutcome(model, signal) {
  if (!validModel(model) || signal.learned || !signal.quality || !Array.isArray(signal.features) || signal.features.length !== FEATURE_COUNT) return false;
  const label = signal.hitTargets > 0 ? 1 : signal.state === 'STOPPED' ? 0 : null;
  if (label === null || !signal.features.every(Number.isFinite)) return false;
  // The prediction was frozen when the signal was created, before its outcome.
  if (signal.quality.trainedSamples >= 30) {
    model.walkForward.push({ prediction: signal.quality.probability, baseline: signal.quality.baseline, label });
    model.walkForward = model.walkForward.slice(-100);
  }
  const current = sigmoid(model.weights.reduce((sum, weight, i) => sum + weight * signal.features[i], 0));
  const rate = 0.04 / Math.sqrt(1 + model.samples / 100);
  model.weights = model.weights.map((weight, i) => clamp(weight + rate * ((label - current) * signal.features[i] - 0.001 * weight), -5, 5));
  model.samples++;
  model.successes += label;
  signal.learned = true;
  signal.outcome = label;
  return true;
}

