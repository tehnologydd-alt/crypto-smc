/**
 * Fail-closed build boundary: enable /v1/bundle ONLY in separately staged
 * authenticated HTTPS web preview. Android sources remain unchanged.
 */
const disabled='<meta name="apex-news-gateway-mode" content="disabled">';
const enabled='<meta name="apex-news-gateway-mode" content="same-origin">';
export function validateHostedConfig(env={}){
 if(env.APEX_HOSTED_NEWS_ENABLED!=='1')
  throw Error('Hosted news integration must be explicitly enabled');
 const origin=env.APEX_PROXY_ORIGIN;
 let u;
 try{u=new URL(origin);}catch{throw Error('Invalid APEX_PROXY_ORIGIN');}
 if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||
    u.search||u.hash||u.pathname!=='/')
  throw Error('APEX_PROXY_ORIGIN must be exact HTTPS origin');
 const domain=env.APEX_PUBLIC_DOMAIN;
 if(typeof domain!=='string'||!domain||
    domain!==u.host||domain.includes('@'))
  throw Error('APEX_PUBLIC_DOMAIN must match proxy origin host');
 return {origin,domain};
}
export function renderHostedIndex(index,env){
 validateHostedConfig(env);
 if(typeof index!=='string'||index.split(disabled).length!==2)
  throw Error('Expected exactly one disabled gateway meta tag');
 return index.replace(disabled,enabled);
}
