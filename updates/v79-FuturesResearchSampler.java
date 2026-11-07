package com.apexintelligence.monitor;

/** APEX 7.9: NON-TRADING public Futures market health sampler.
 *
 * Invoked only from the EXISTING shared WorkManager worker when the user has
 * enabled research in Android. Records ACTUAL public CLOSED candles, never
 * fictitious executions or signals. Bounded to 4 symbols x 2 venues per run.
 *
 * The system is free to defer/stop periodic work due to battery/Doze/offline.
 */
final class FuturesResearchSampler {
    private static final int MAX_SYMBOLS=4, MAX_RESULTS=64;
    private static final long FIVE=300000L, HOUR=3600000L, FOUR=14400000L;
    private FuturesResearchSampler(){}

    static java.util.List<String> symbols(android.content.SharedPreferences p){
        java.util.ArrayList<String> out=new java.util.ArrayList<>();
        try{
            org.json.JSONArray a=new org.json.JSONArray(p.getString("futuresStudySymbols","[]"));
            for(int i=0;i<a.length()&&out.size()<MAX_SYMBOLS;i++){
                String s=a.optString(i,"");
                if(s.matches("[A-Z0-9]{2,20}USDT")&&!out.contains(s))out.add(s);
            }
        }catch(Exception ignored){}
        return out;
    }
    private static long frameMs(String frame){
        if("1h".equals(frame))return HOUR;
        if("4h".equals(frame))return FOUR;
        return FIVE;
    }
    private static String bybitInterval(String frame){
        if("1h".equals(frame))return "60";
        if("4h".equals(frame))return "240";
        return "5";
    }
    private static org.json.JSONObject load(String url)throws Exception{
        java.net.HttpURLConnection c=null;
        try{
            c=(java.net.HttpURLConnection)new java.net.URL(url).openConnection();
            c.setConnectTimeout(5000);
            c.setReadTimeout(6000);
            c.setRequestMethod("GET");
            c.setRequestProperty("Accept","application/json");
            c.setRequestProperty("User-Agent","APEX-Research/7.9");
            int status=c.getResponseCode();
            if(status!=200)throw new java.io.IOException("HTTP "+status);
            java.io.InputStream in=c.getInputStream();
            try(java.io.BufferedInputStream b=new java.io.BufferedInputStream(in);
                java.io.ByteArrayOutputStream buf=new java.io.ByteArrayOutputStream()){
                byte[] tmp=new byte[2048];int read,total=0;
                while((read=b.read(tmp))!=-1){
                    total+=read;if(total>256000)throw new java.io.IOException("Ответ слишком велик");
                    buf.write(tmp,0,read);
                }
                // Binance kline root is an ARRAY; return wrapped normalized body.
                return new org.json.JSONObject().put("body",new String(buf.toByteArray(),"UTF-8"));
            }
        }finally{if(c!=null)c.disconnect();}
    }
    private static org.json.JSONObject one(String source,String symbol,String frame,long now){
        long ms=frameMs(frame);
        org.json.JSONObject out=new org.json.JSONObject();
        try{
            out.put("source",source);
            out.put("symbol",symbol);
            out.put("frame",frame);
            out.put("sourceVersion","binance".equals(source)?"binance-futures-public-v1":"bybit-linear-public-v1");
            out.put("checkedAt",now);
            out.put("lastClosedAt",0);
            out.put("barCount",0);
            out.put("gapCount",0);
            out.put("status","NO_DATA");
            out.put("message","Публичные свечи не получены");
            if(!symbol.matches("[A-Z0-9]{2,20}USDT"))return out;
            String url="binance".equals(source)
                ?"https://fapi.binance.com/fapi/v1/klines?symbol="+symbol+"&interval="+frame+"&limit=40"
                :"https://api.bybit.com/v5/market/kline?category=linear&symbol="+symbol+
                    "&interval="+bybitInterval(frame)+"&limit=40";
            String body=load(url).getString("body");
            org.json.JSONArray raw;
            if("binance".equals(source)){
                raw=new org.json.JSONArray(body);
            }else{
                org.json.JSONObject wrapper=new org.json.JSONObject(body);
                if(wrapper.optInt("retCode",-1)!=0)throw new java.io.IOException("Bybit код "+wrapper.optInt("retCode",-1));
                raw=wrapper.getJSONObject("result").getJSONArray("list");
            }
            java.util.TreeSet<Long> closedStarts=new java.util.TreeSet<>();
            for(int i=0;i<raw.length();i++){
                org.json.JSONArray b=raw.optJSONArray(i);if(b==null||b.length()<6)continue;
                long start=b.optLong(0,0);
                if(start<=0||start+ms>now)continue; // NEVER include open candle
                double open=b.optDouble(1,Double.NaN),high=b.optDouble(2,Double.NaN),
                    low=b.optDouble(3,Double.NaN),close=b.optDouble(4,Double.NaN),
                    volume=b.optDouble(5,Double.NaN);
                if(!Double.isFinite(open)||!Double.isFinite(high)||!Double.isFinite(low)||
                   !Double.isFinite(close)||!Double.isFinite(volume)||
                   open<=0||close<=0||low<=0||volume<0||
                   high<Math.max(open,close)||low>Math.min(open,close))continue;
                closedStarts.add(start);
            }
            if(closedStarts.isEmpty()){
                out.put("message","Нет подтверждённых закрытых свечей");
                return out;
            }
            int gaps=0;
            Long prev=null;
            for(Long t:closedStarts){if(prev!=null&&t.longValue()-prev.longValue()!=ms)gaps++;prev=t;}
            long closedAt=closedStarts.last()+ms;
            long age=now-closedAt;
            boolean fresh=age>=0&&age<=Math.max(ms*2,600000L);
            String status=closedStarts.size()<36?"NO_DATA":gaps>0?"GAP":fresh?"READY":"STALE";
            out.put("lastClosedAt",closedAt);
            out.put("barCount",closedStarts.size());
            out.put("gapCount",gaps);
            out.put("status",status);
            out.put("message","READY".equals(status)?"Получены непрерывные закрытые свечи":
                "GAP".equals(status)?"Обнаружены отсутствующие интервалы":
                "STALE".equals(status)?"Последняя закрытая свеча устарела":"Недостаточно закрытых свечей");
        }catch(Exception e){
            try{
                out.put("status","ERROR");
                // Do not preserve third-party response bodies/stack traces.
                String msg=e.getMessage()==null?"ошибка запроса":e.getMessage();
                if(msg.contains("HTTP "))out.put("message",msg.substring(0,Math.min(28,msg.length())));
                else out.put("message","Ошибка публичного источника");
            }catch(org.json.JSONException ignored){}
        }
        return out;
    }
    static void sample(android.content.Context context,android.content.SharedPreferences prefs){
        if(!prefs.getBoolean("futuresStudyEnabled",false))return;
        long start=System.currentTimeMillis();
        java.util.List<String> selection=symbols(prefs);
        String mode=prefs.getString("futuresStudyVenues","binance");
        String frame=prefs.getString("futuresStudyFrame","5m");
        if(!"5m".equals(frame)&&!"1h".equals(frame)&&!"4h".equals(frame))frame="5m";
        boolean binance="binance".equals(mode)||"both".equals(mode),
            bybit="bybit".equals(mode)||"both".equals(mode);
        org.json.JSONArray checks=new org.json.JSONArray();
        int ok=0,problems=0;
        try{
            for(String symbol:selection){
                if(Thread.currentThread().isInterrupted())break;
                for(String source:new String[]{"binance","bybit"}){
                    if(("binance".equals(source)&&!binance)||("bybit".equals(source)&&!bybit))continue;
                    org.json.JSONObject result=one(source,symbol,frame,System.currentTimeMillis());
                    checks.put(result);
                    if("READY".equals(result.optString("status")))ok++;else problems++;
                }
            }
            long done=System.currentTimeMillis();
            org.json.JSONObject record=new org.json.JSONObject();
            record.put("startedAt",start);record.put("finishedAt",done);
            record.put("source","public-futures-health-v1");
            record.put("frame",frame);record.put("venues",mode);
            record.put("selectedCount",selection.size());record.put("checks",checks);
            record.put("ready",ok);record.put("problems",problems);
            org.json.JSONArray history=new org.json.JSONArray(prefs.getString("futuresStudyHistory","[]"));
            history.put(record);
            org.json.JSONArray bounded=new org.json.JSONArray();
            for(int i=Math.max(0,history.length()-MAX_RESULTS);i<history.length();i++)
                bounded.put(history.get(i));
            prefs.edit().putLong("futuresStudyLastRunAt",done)
                .putString("futuresStudyLastResult",ok+" из "+checks.length()+" рынков READY; проблем: "+problems)
                .putString("futuresStudyHistory",bounded.toString()).apply();
        }catch(Exception e){
            prefs.edit().putLong("futuresStudyLastRunAt",System.currentTimeMillis())
                .putString("futuresStudyLastResult","Ошибка сохранения фонового наблюдения").apply();
        }
    }
}
