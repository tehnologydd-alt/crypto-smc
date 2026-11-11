/**
 * Small, conservative, checked asset-identity reference set for APEX.
 *
 * As-published evidence, not a ticker search. A contract must match BOTH
 * the native chain and the exact known address; wrapped/bridged tokens
 * require their own verified reference and are NOT automatically promoted.
 *
 * Sources for reference data:
 * AAVE: https://github.com/aave/aave-token (mainnet proxy)
 * TRB: https://www.coindesk.com/ru/price/tellor (ETH contract)
 * ZEC: https://z.cash (native Zcash coin; no Solana/NEAR contract)
 *
 * New symbols default to NO_REFERENCE: never whitelist ticker matches.
 * This registry does not prove pool liquidity or safety.
 */
export const ASSET_IDENTITY_REFERENCES=Object.freeze({
 ZEC:Object.freeze({type:'NATIVE',network:'zcash',source:'https://z.cash'}),
 AAVE:Object.freeze({
  type:'TOKEN',network:'ethereum',
  contract:'0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
  source:'https://github.com/aave/aave-token'
 }),
 TRB:Object.freeze({
  type:'TOKEN',network:'ethereum',
  contract:'0x88df592f8eb5d7bd38bfef7deb0fbc02cf3778a0',
  source:'https://www.coindesk.com/ru/price/tellor'
 })
});
const NETWORK_ALIASES=Object.freeze({
 eth:'ethereum',ethereum:'ethereum',
 solana:'solana',near:'near',base:'base',bsc:'bsc',
 binance:'bsc',arbitrum:'arbitrum',arb:'arbitrum',
 polygon_pos:'polygon',polygon:'polygon',avax:'avalanche',
 avalanche:'avalanche',zcash:'zcash'
});
export const normalizeDexNetwork=x=>{
 if(typeof x!=='string')return null;
 const key=x.trim().toLowerCase();
 return Object.hasOwn(NETWORK_ALIASES,key)?
  NETWORK_ALIASES[key]:key||null;
};
export function assessDexAssetIdentity(asset,chain,tokenAddress){
 const base=typeof asset==='string'?asset.replace(/(?:USDT|USDC|BTC|ETH)$/,''):null;
 const ref=base&&Object.hasOwn(ASSET_IDENTITY_REFERENCES,base)?
  ASSET_IDENTITY_REFERENCES[base]:null;
 const network=normalizeDexNetwork(chain);
 const contract=typeof tokenAddress==='string'?tokenAddress.trim().toLowerCase():'';
 if(!ref)return {state:'NO_REFERENCE',referenceMatched:false,
  reason:'Нет проверенной привязки этого тикера к сети и контракту.'};
 if(ref.type==='NATIVE')return {
  state:'NATIVE_OTHER_NETWORK',referenceMatched:false,
  referenceNetwork:ref.network,
  reason:base+' — монета собственной сети '+ref.network+
   '. Токен с этим тикером в DEX может быть обёрнутым или одноимённым; связь не доказана.'
 };
 if(network!==ref.network)return {
  state:'FOREIGN_NETWORK',referenceMatched:false,
  referenceNetwork:ref.network,
  reason:'Пул в другой сети. Мост или обёртка не подтверждены.'
 };
 if(!/^0x[0-9a-f]{40}$/.test(contract))return {
  state:'NO_TOKEN_ADDRESS',referenceMatched:false,
  referenceNetwork:ref.network,
  reason:'Отсутствует полный проверяемый адрес контракта токена.'
 };
 if(contract!==ref.contract.toLowerCase())return {
  state:'CONTRACT_MISMATCH',referenceMatched:false,
  referenceNetwork:ref.network,
  reason:'Контракт не совпадает с эталонным контрактом '+base+
   ' в '+ref.network+'.'
 };
 return {
  state:'REFERENCE_MATCH',referenceMatched:true,
  referenceNetwork:ref.network,referenceSource:ref.source,
  reason:'Сеть и адрес токена совпали с эталонным контрактом. '+
   'Это не подтверждает ликвидность пула, мосты и безопасность торговли.'
 };
}
