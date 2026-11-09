/**
 * Internal APEX use budgets, NOT claims about a provider's current allowance.
 * NewsData Free (officially documented): 200 credits/day, delayed ~12h.
 * Cap at 180 requests/day to leave headroom for manual account use.
 * CryptoPanic entitlement/rates depend on account plan: fail conservative.
 * All timestamps/budget windows use UTC; never infer which plan the owner has.
 */
export const NEWS_SOURCE_POLICY=Object.freeze({
 cryptopanic:Object.freeze({
  daily:4,monthly:100,gapMs:6*3600000,cacheMs:6*3600000,
  publicFreeAllowance:null,freeDelayHours:null,
  planStatus:'ACCOUNT_ACCESS_UNVERIFIED'
 }),
 newsdata:Object.freeze({
  daily:180,monthly:5580,gapMs:10*60000,cacheMs:6*3600000,
  publicFreeAllowance:'200 credits/day',freeDelayHours:12,
  planStatus:'FREE_PLAN_DOCUMENTED_ACCOUNT_UNVERIFIED'
 })
});
export function sourceUsageDescription(id){
 const p=NEWS_SOURCE_POLICY[id];
 if(!p)return null;
 return {
  id,internalDailyCap:p.daily,internalMonthlyCap:p.monthly,
  minGapMinutes:p.gapMs/60000,cacheHours:p.cacheMs/3600000,
  freePlanPublishedAllowance:p.publicFreeAllowance,
  freePlanDelayHours:p.freeDelayHours,planStatus:p.planStatus,
  limitScope:'INTERNAL_PROTECTION_NOT_VENDOR_LIMIT'
 };
}
