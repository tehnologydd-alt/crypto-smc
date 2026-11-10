/** A curated icon association, never a symbol-search icon guess.
 * Known coin images use Trust Wallet's public open asset library, with a
 * strict text fallback if a logo is missing/offline. GRAM has a local simple
 * geometric mark matching the TON media description (not the original file).
 */
const chains=Object.freeze({
 BTC:'bitcoin',ETH:'ethereum',SOL:'solana',
 XRP:'ripple',BNB:'smartchain',DOGE:'doge',
 ADA:'cardano',LTC:'litecoin',BCH:'bitcoincash',
 TRX:'tron',DOT:'polkadot',AVAX:'avalanchec'
});
export function assetLogoSource(symbol){
 if(typeof symbol!=='string'||!/^[A-Z0-9]{2,16}USDT$/.test(symbol))return null;
 const base=symbol.slice(0,-4),path=chains[base];
 return path?'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/'+
  path+'/info/logo.png':null;
}
function gramMark(){
 const NS='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(NS,'svg');
 svg.setAttribute('viewBox','0 0 40 40');
 svg.setAttribute('class','favorite-gram-mark');
 svg.setAttribute('aria-hidden','true');
 function path(d,fill){
  const n=document.createElementNS(NS,'path');
  n.setAttribute('d',d);n.setAttribute('fill',fill);svg.append(n);
 }
 path('M20 1 L39 20 L20 39 L1 20 Z','#30A1F5');
 // The TON media describes the Gram logo as a white star on a blue diamond.
 // This compact local approximation is never passed off as an official file.
 path('M20 9.2L23.4 16.5L31.5 17.7L25.6 23.2L27 31L20 27.2L13 31L14.4 23.2L8.5 17.7L16.6 16.5Z','#FFFFFF');
 return svg;
}
export function attachAssetLogo(target,symbol,fallback){
 const base=String(symbol||'').replace(/USDT$/,'');
 target.replaceChildren();
 target.classList.remove('has-asset-logo');
 if(base==='GRAM'){
  target.append(gramMark());target.classList.add('has-asset-logo');
  return {kind:'LOCAL_BRAND_APPROXIMATION'};
 }
 const source=assetLogoSource(symbol);
 if(!source){
  target.textContent=fallback||base.slice(0,1);
  return {kind:'FALLBACK'};
 }
 const image=document.createElement('img');
 image.alt='';image.loading='lazy';image.decoding='async';
 image.referrerPolicy='no-referrer';image.className='favorite-asset-logo';
 image.onerror=()=>{
  if(image.parentNode===target){
   target.replaceChildren(document.createTextNode(fallback||base.slice(0,1)));
   target.classList.remove('has-asset-logo');
  }
 };
 image.onload=()=>{if(image.parentNode===target)target.classList.add('has-asset-logo')};
 image.src=source;target.append(image);
 return {kind:'TRUSTWALLET_PUBLIC_ASSET',source};
}
