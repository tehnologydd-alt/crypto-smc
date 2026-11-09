import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHostedConfig,renderHostedIndex} from './hosted-tools.mjs';
const good={APEX_HOSTED_NEWS_ENABLED:'1',
 APEX_PROXY_ORIGIN:'https://research.example',
 APEX_PUBLIC_DOMAIN:'research.example'};
test('hosted gateway activation must be explicit and HTTPS-only',()=>{
 assert.equal(validateHostedConfig(good).domain,'research.example');
 assert.throws(()=>validateHostedConfig({...good,APEX_HOSTED_NEWS_ENABLED:'0'}));
 assert.throws(()=>validateHostedConfig({...good,APEX_PROXY_ORIGIN:'http://research.example'}));
 assert.throws(()=>validateHostedConfig({...good,APEX_PUBLIC_DOMAIN:'other.example'}));
 assert.throws(()=>validateHostedConfig({...good,APEX_PROXY_ORIGIN:'https://research.example/path'}));
});
test('hosted activation changes only one copied index meta tag',()=>{
 const original='<html><meta name="apex-news-gateway-mode" content="disabled"></html>';
 const result=renderHostedIndex(original,good);
 assert.match(result,/content="same-origin"/);
 assert.doesNotMatch(result,/content="disabled"/);
 assert.throws(()=>renderHostedIndex(result,good));
});
