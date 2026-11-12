import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {editorialState,visibleEditorialStory,
 nextObservedMacroEvent,settingGroupTitles}
 from './clean-intelligence-editorial.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');

test('source status never promotes cached, offline or loading material to verified',()=>{
 const cases=[
  ['Проверяем запросы и кеш…','LOADING'],
  ['Ожидаем проверенный ответ','LOADING'],
  ['GDELT · OFFLINE · квота исчерпана','UNAVAILABLE'],
  ['Источник недоступен','UNAVAILABLE'],
  ['BLS · не удалось проверить значения','UNAVAILABLE'],
  ['GDELT · сохранённая копия · актуальность не подтверждена','SAVED'],
  ['BLS · сохранённый архив от 11.11','SAVED'],
  ['Новостей: 0 · фактические источники: отсутствуют','REPORTED'],
  ['BLS · календарь от 12.11','OBSERVED'],
  ['Неизвестный статус','UNKNOWN']
 ];
 for(const [input,state] of cases)
  assert.equal(editorialState(input).state,state,input);
 assert.match(editorialState('Новостей: 0').label,/Сводка/);
 assert.equal(editorialState('').state,'LOADING');
});
test('news filters show only real source marks; never hallucinate asset relevance',()=>{
 const rows=[
  {archived:false,direct:true},
  {archived:true,direct:false},
  {archived:false,direct:false}
 ];
 assert.equal(rows.filter(x=>visibleEditorialStory({...x,mode:'all'})).length,3);
 assert.equal(rows.filter(x=>visibleEditorialStory({...x,mode:'direct'})).length,1);
 assert.equal(rows.filter(x=>visibleEditorialStory({...x,mode:'archive'})).length,1);
 assert.equal(visibleEditorialStory({mode:'archive',archived:false}),false);
 assert.equal(visibleEditorialStory({mode:'direct',direct:false}),false);
});
test('next macro event displays first observed official calendar card, no generated dates',()=>{
 assert.equal(nextObservedMacroEvent([]),null);
 assert.equal(nextObservedMacroEvent([{title:'',time:''}]),null);
 const next=nextObservedMacroEvent([
  {title:'  CPI ',time:'  13 ноя · 15:30 ',archive:true},
  {title:'PPI',time:'20 ноя · 15:30',archive:false}
 ]);
 assert.deepEqual(next,{
  title:'CPI',time:'13 ноя · 15:30',archive:true
 });
});
test('settings regrouping retains original Android controls and encrypted backup input',()=>{
 const groups=settingGroupTitles();
 assert.deepEqual(groups.map(x=>x.id),['updates','alerts','screen','backup']);
 const index=read('./index.html'),app=read('./app.mjs');
 const ui=read('./clean-intelligence-editorial.mjs');
 for(const name of ['apex-settings-background','apex-settings-alert-scope',
  'apex-settings-alerts','apex-settings-alert-limit',
  'apex-settings-alert-targets','apex-settings-alert-stop',
  'apex-settings-screen','apex-backup-passphrase','apex-backup-export',
  'apex-backup-import','apex-settings-sources']){
  assert.ok(index.includes('id="'+name+'"'),name);
 }
 assert.match(ui,/groups\[index\]\.push\(node\)/);
 assert.match(ui,/section\.append\(node\)/);
 assert.match(ui,/header\.after\(nav\)/);
 assert.match(app,/setMobileSettings\(\{alertScope:requested,alertMarkedIds:ids\}\)/);
 assert.match(app,/getMobileCloudBackupStatus\(\)/);
 assert.match(app,/el\('apex-backup-passphrase'\)/);
 assert.ok(!ui.includes("id('apex-backup-passphrase')?.value"));
 assert.ok(!ui.includes('localStorage'));
 assert.ok(!ui.includes('fetch('));
});
test('news and macro layouts preserve original source panels and fetch quotas',()=>{
 const ui=read('./clean-intelligence-editorial.mjs');
 const app=read('./app.mjs');
 const original=read('./editorial-dashboard.mjs');
 const index=read('./index.html');
 for(const name of ['editorial-news-status','editorial-news-list',
  'editorial-news-analysis','editorial-news-quality','editorial-news-refresh',
  'editorial-macro-status','editorial-macro-list','editorial-macro-refresh',
  'macro-calendar-status','macro-calendar-list',
  'macro-indicators-status','macro-indicators-list']){
  assert.ok(index.includes('id="'+name+'"'),name);
 }
 assert.match(ui,/details\.append\(budget,status,analysis,quality,sources\)/);
 assert.match(ui,/hero\.after\(calendar\)/);
 assert.match(ui,/calendar\.after\(indicators\)/);
 assert.match(ui,/indicators\.after\(feed\)/);
 assert.match(ui,/entries\.map\(entry=>\(\{/);
 assert.match(ui,/new MutationObserver\(render\)\.observe\(list,\{childList:true\}\)/);
 assert.match(original,/budget\.load\(mode,/);
 assert.match(original,/fetchPublicRssNews\(\)/);
 assert.match(original,/budget\.load\('calendar'/);
 assert.match(app,/initCleanIntelligenceEditorial\(\)/);
 assert.ok(!ui.includes('loadEditorialFeed('));
 assert.ok(!ui.includes('fetchBlsIndicators('));
});
test('stage 8 files are packaged into Android APK and phone-first styling enabled',()=>{
 const p=read('../apex9-android/scripts/prepare-web.mjs');
 const index=read('./index.html'),app=read('./app.mjs');
 const skin=read('./clean-intelligence-editorial.css');
 for(const file of ['clean-intelligence-editorial.css',
  'clean-intelligence-editorial.mjs'])
  assert.ok(p.includes("'"+file+"'"),'Android package missing '+file);
 assert.ok(index.includes('./clean-intelligence-editorial.css'));
 assert.ok(app.includes("import {initCleanIntelligenceEditorial}"));
 assert.ok(skin.includes('.apex-settings-dialog.ci8-settings-redesigned'));
 assert.ok(skin.includes('#view-news>.ci8-editorial-hero'));
 assert.ok(skin.includes('#view-macro>.ci8-editorial-hero'));
 assert.ok(skin.includes('.ci8-news-filter-actions'));
 assert.ok(skin.includes('@media(max-width:390px)'));
 assert.ok(skin.includes('prefers-reduced-motion'));
});
