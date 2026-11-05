package com.apexintelligence.monitor;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
 private void rememberScenario(Intent intent){
  if(intent!=null){String id=intent.getStringExtra("scenarioId");
   if(id!=null&&!id.isEmpty())getSharedPreferences(BackgroundMonitorPlugin.PREF,Context.MODE_PRIVATE)
    .edit().putString("openedScenario",id).apply();}
 }
 @Override public void onCreate(Bundle state){
  registerPlugin(BackgroundMonitorPlugin.class);
  super.onCreate(state);
  rememberScenario(getIntent());
  WindowCompat.setDecorFitsSystemWindows(getWindow(),false);
  View content=findViewById(android.R.id.content);
  if(content!=null){
   ViewCompat.setOnApplyWindowInsetsListener(content,(v,insets)->{
    Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());
    v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
    return insets;
   });
   ViewCompat.requestApplyInsets(content);
  }
  android.content.SharedPreferences prefs=getSharedPreferences(BackgroundMonitorPlugin.PREF,Context.MODE_PRIVATE);
  if(!prefs.getBoolean("v26_notifications_migrated",false)){
   NotificationManager nm=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
   if(nm!=null)nm.cancelAll();
   prefs.edit().putBoolean("v26_notifications_migrated",true).apply();
  }
 }
 @Override protected void onNewIntent(Intent intent){
  super.onNewIntent(intent);setIntent(intent);rememberScenario(intent);
 }
}
