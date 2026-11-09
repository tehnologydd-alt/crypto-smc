import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const favorites=read('./favorite-dashboard.mjs');
const levels=read('./research-level-sequence.mjs');
const html=read('./index.html');
test('every valid forecast card displays reference, conditional TP1-TP3 SL',()=>{
 assert.ok(favorites.includes('card.append(renderLevelSequence(row))'));
 assert.ok(favorites.includes("['TP1',plan[key].tp1]"));
 assert.ok(favorites.includes("['TP2',plan[key].tp2]"));
 assert.ok(favorites.includes("['TP3',plan[key].tp3]"));
 assert.ok(favorites.includes("['SL',plan[key].sl]"));
 assert.ok(favorites.includes('forecast-level-reference'));
 assert.ok(favorites.includes('Условно вверх'));
 assert.ok(favorites.includes('Условно вниз'));
 assert.ok(favorites.includes('Проверить порядок касаний H1'));
});
test('source is strictly original Android Room H1, never reconstructed candle path',()=>{
 assert.ok(favorites.includes("getMobileCandleArchive(asset,'1h'"));
 assert.ok(favorites.includes("data.native&&data.complete&&!data.error"));
 assert.ok(favorites.includes("if(!archive.native||archive.error||!archive.complete)"));
 assert.ok(favorites.includes('analyzeResearchLevelSequence(plan,archive.candles'));
 assert.ok(levels.includes('PUBLICATION_HOUR_UNKNOWN'));
 assert.ok(levels.includes('SAME_H1_UNKNOWN'));
 assert.ok(html.includes('Восстановленные задним числом уровни'));
});
test('old-forecast replays are labelled retrospective, not counted as prediction wins',()=>{
 assert.ok(levels.includes("origin=h.levelStudy?'PUBLISHED':'RETROSPECTIVE'"));
 assert.ok(favorites.includes('не считаются результатом прогноза'));
 assert.ok(levels.includes("plan.origin==='PUBLISHED'"));
 assert.ok(levels.includes('первая H1-свеча может включать движение до публикации'));
});
test('new native forecasts commit immutable levelStudy on creation',()=>{
 const nativePath='../apex9-android/native/src/main/java/com/apexintelligence/research/';
 const auto=read(nativePath+'ApexAutoForecast.kt');
 const plugin=read(nativePath+'ApexNativePlugin.kt');
 const helper=read(nativePath+'ApexResearchLevels.kt');
 assert.ok(auto.includes('.put("levelStudy",ApexResearchLevels.build(close,low,high))'));
 assert.ok(plugin.includes('ApexResearchLevels.build(anchorClose, bandLow, bandHigh)'));
 assert.ok(helper.includes('H1_DUAL_LEVEL_STUDY_V1'));
 assert.ok(helper.includes('.put("UP", up)'));
 assert.ok(helper.includes('.put("DOWN", down)'));
});
