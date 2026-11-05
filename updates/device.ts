/** Only when the Android Activity is visible; never a background wake lock. */
import {Capacitor,registerPlugin} from '@capacitor/core';
interface ScreenControl{setKeepScreenOn(options:{enabled:boolean}):Promise<{enabled:boolean}>}
const monitor=registerPlugin<ScreenControl>('BackgroundMonitor');
export async function applyKeepScreenOn(enabled:boolean):Promise<void>{
 if(Capacitor.isNativePlatform())await monitor.setKeepScreenOn({enabled});
}
