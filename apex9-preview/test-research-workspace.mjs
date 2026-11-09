import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE,workspaceArea,researchAreaForTarget,activeDock}
 from './research-workspace.mjs';

test('five flat, directly addressable research tasks',()=>{
 assert.deepEqual(WORKSPACE.quality,
  ['summary','data','tests','regimes','compare']);
 assert.equal(new Set(WORKSPACE.quality).size,5);
 assert.equal(workspaceArea('quality'), 'summary');
 for(const mode of WORKSPACE.quality)
  assert.equal(workspaceArea('quality',mode),mode);
 assert.equal(workspaceArea('quality','__proto__'),'summary');
 assert.equal(workspaceArea('quality','invalid'),'summary');
});
test('passport is divided into exactly three primary, non-nested areas',()=>{
 assert.deepEqual(WORKSPACE.asset,['chart','structure','data']);
 assert.equal(workspaceArea('asset'),'chart');
 for(const mode of WORKSPACE.asset)
  assert.equal(workspaceArea('asset',mode),mode);
 assert.equal(workspaceArea('asset','summary'),'chart');
});
test('all existing research targets map to the visible flat workspace',()=>{
 assert.equal(researchAreaForTarget('synthesis-panel'),'summary');
 assert.equal(researchAreaForTarget('evidence-lab-panel'),'data');
 assert.equal(researchAreaForTarget('validation-panel'),'tests');
 assert.equal(researchAreaForTarget('patterns-panel'),'tests');
 assert.equal(researchAreaForTarget('regimes-panel'),'regimes');
 assert.equal(researchAreaForTarget('cross-title'),'compare');
 assert.equal(researchAreaForTarget('fake-id'),'summary');
 assert.equal(researchAreaForTarget('__proto__'),'summary');
});
test('quality becomes first-class direct bottom tab',()=>{
 for(const name of ['overview','radar','asset','forecasts','quality'])
  assert.equal(activeDock(name),name);
 assert.equal(activeDock('sources'),'quality');
 for(const name of ['news','macro','catalog'])
  assert.equal(activeDock(name),'overview');
});
test('unrelated router input never becomes a shown research section',()=>{
 assert.equal(workspaceArea('not-supported','summary'),null);
 assert.equal(workspaceArea('quality',null),'summary');
 assert.equal(workspaceArea('asset',null),'chart');
});
