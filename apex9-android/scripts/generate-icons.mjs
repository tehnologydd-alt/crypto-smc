/**
 * Generate authentic APEX 9 launcher icons from one original SVG and place
 * a separate monochrome vector into Android notification resources.
 * Run only after 'npx cap add android' creates the native project.
 */
import sharp from 'sharp';
import {readFileSync,existsSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
const res=join(project,'android/app/src/main/res');
const manifest=join(project,'android/app/src/main/AndroidManifest.xml');
const src=join(project,'assets/apex-icon.svg');
const small=join(project,'assets/ic_stat_apex.xml');
if(!existsSync(src)||!existsSync(small)||!existsSync(manifest))throw Error('Run after npx cap add android with source icons in place');
const source=Buffer.from(readFileSync(src));
const densities={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
const densityDirs=Object.keys(densities);
for(const density of densityDirs){
 const px=densities[density],target=join(res,'mipmap-'+density);
 mkdirSync(target,{recursive:true});
 const png=await sharp(source).resize(px,px).png().toBuffer();
 writeFileSync(join(target,'ic_launcher.png'),png);
 writeFileSync(join(target,'ic_launcher_round.png'),png);
 // Adaptive icon foreground is safely inset to account for OEM masking.
 const canvas=Math.round(px*2.25),size=Math.round(canvas*.79),padding=Math.floor((canvas-size)/2);
 const foreground=await sharp(source).resize(size,size).extend({
  top:padding,bottom:canvas-size-padding,left:padding,right:canvas-size-padding,
  background:{r:0,g:0,b:0,alpha:0}
 }).png().toBuffer();
 writeFileSync(join(target,'ic_launcher_foreground.png'),foreground);
}
const anydpi=join(res,'mipmap-anydpi-v26');
mkdirSync(anydpi,{recursive:true});
const adaptive=`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
 <background android:drawable="@color/apex_icon_background"/>
 <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;
for(const name of ['ic_launcher.xml','ic_launcher_round.xml'])writeFileSync(join(anydpi,name),adaptive);
const values=join(res,'values');mkdirSync(values,{recursive:true});
writeFileSync(join(values,'apex_palette.xml'),`<?xml version="1.0" encoding="utf-8"?>
<resources>
 <color name="apex_icon_background">#06131C</color>
 <color name="apex_notification_color">#37DDE3</color>
</resources>`);
const drawable=join(res,'drawable');mkdirSync(drawable,{recursive:true});
copyFileSync(small,join(drawable,'ic_stat_apex.xml'));
let xml=readFileSync(manifest,'utf8');
if(!xml.includes('com.google.firebase.messaging.default_notification_icon')){
 if(!xml.includes('<application'))throw Error('AndroidManifest.xml missing application');
 xml=xml.replace(/(<application\b[^>]*>)/,`$1
  <!-- Android notification icon: monochrome silhouette, never the launcher image -->
  <meta-data android:name="com.google.firebase.messaging.default_notification_icon"
             android:resource="@drawable/ic_stat_apex" />
  <meta-data android:name="com.google.firebase.messaging.default_notification_color"
             android:resource="@color/apex_notification_color" />`);
 writeFileSync(manifest,xml);
}
if(!xml.includes('@drawable/ic_stat_apex'))throw Error('Notification icon not present in manifest');
console.log('APEX launcher + adaptive resources and monochrome notification icon installed.');
