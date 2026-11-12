package com.apexintelligence.research

import android.content.Context
import android.net.Uri
import androidx.sqlite.db.SupportSQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.CipherOutputStream
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Device-portable, passphrase-encrypted APEX backups. No cloud account token,
 * third-party server, raw unencrypted export or stored passphrase.
 *
 * Android Storage Access Framework accepts Google Drive or any installed
 * cloud document provider selected explicitly by the user.
 *
 * All six Room tables are exported as JSON Lines in a compressed authenticated
 * zip. Import is validation-first, MERGE-ONLY (INSERT OR IGNORE) in one SQLite
 * transaction. An interrupted import cannot wipe existing research.
 */
object ApexPortableBackup {
    const val FORMAT = "APEX_PORTABLE_BACKUP_V1"
    const val MIME = "application/octet-stream"
    private const val MAGIC = "APEXBK01"
    private const val KDF_ROUNDS = 220_000
    private const val MAX_ZIP = 256L * 1024L * 1024L
    private const val MAX_UNCOMPRESSED = 768L * 1024L * 1024L
    private const val MAX_LINES = 2_500_000L
    private const val MAX_LINE = 65536
    private val tableColumns = linkedMapOf(
        "research_observations" to listOf("id","asset","source","kind",
            "sourceState","observedAt","collectedAt","payloadJson"),
        "market_candles" to listOf("asset","interval","openTime",
            "closeTime","open","high","low","close","volume","recordedAt"),
        "research_forecasts" to listOf("id","asset","horizon","status",
            "publishedAt","updatedAt","hypothesisJson"),
        "research_forecast_stages" to listOf("forecastId","stage",
            "observedAt","recordedAt","explanation"),
        "research_forecast_results" to listOf("forecastId","outcome",
            "evaluatedAt","targetCloseAt","actualClose","actualChangePct"),
        "research_shadow_candidates" to listOf("id","asset","interval",
            "featureId","association","registeredAt","embargoUntil",
            "sourceCutoffAt","historySize","evidenceVersion")
    )
    private fun countMap() = JSONObject()
    private fun zipName(table:String) = "tables/$table.jsonl"
    private fun securePassword(password:CharArray) {
        require(password.size in 12..128) {
            "Нужна парольная фраза длиной 12–128 символов"
        }
    }
    private fun aes(password:CharArray,salt:ByteArray,mode:Int,iv:ByteArray):Cipher {
        val spec=PBEKeySpec(password,salt,KDF_ROUNDS,256)
        val material=try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec).encoded
        } finally { spec.clearPassword() }
        return try {
            Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(mode,SecretKeySpec(material,"AES"),GCMParameterSpec(128,iv))
                updateAAD(MAGIC.toByteArray(StandardCharsets.US_ASCII))
            }
        } finally { material.fill(0) }
    }
    private fun settingsJson(settings:ResearchSettings,uiIds:List<String>):JSONObject {
        val favourites=JSONArray()
        settings.favorites.forEach{favourites.put(it)}
        val marked=JSONArray()
        settings.alertMarkedIds.sorted().forEach{marked.put(it)}
        val ui=JSONArray()
        uiIds.forEach{ui.put(it)}
        return JSONObject().put("asset",settings.asset)
            .put("favorites",favourites)
            .put("backgroundSyncEnabled",settings.backgroundSyncEnabled)
            .put("forecastAlertsEnabled",settings.forecastAlertsEnabled)
            .put("alertLimitReady",settings.alertLimitReady)
            .put("alertTargets",settings.alertTargets)
            .put("alertStop",settings.alertStop)
            .put("alertScope",settings.alertScope)
            .put("alertMarkedIds",marked)
            .put("uiMarkedIds",ui)
            .put("alertsEnabledAt",settings.alertsEnabledAt)
            .put("keepScreenOn",settings.keepScreenOn)
    }
    private fun zipText(zip:ZipOutputStream,name:String,text:String) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(text.toByteArray(StandardCharsets.UTF_8))
        zip.closeEntry()
    }
    private fun rowsToZip(db:SupportSQLiteDatabase,zip:ZipOutputStream,
        table:String,cols:List<String>):Long {
        val sql="SELECT "+cols.joinToString(",")+" FROM "+table
        var count=0L
        zip.putNextEntry(ZipEntry(zipName(table)))
        val out=BufferedWriter(OutputStreamWriter(zip,StandardCharsets.UTF_8))
        db.query(sql).use {cursor ->
            while(cursor.moveToNext()) {
                count++
                require(count<=MAX_LINES) { "Too many Room rows for backup" }
                val values=JSONArray()
                for(i in cols.indices){
                    val v:Any?=when(cursor.getType(i)){
                        android.database.Cursor.FIELD_TYPE_NULL -> JSONObject.NULL
                        android.database.Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(i)
                        android.database.Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(i)
                        android.database.Cursor.FIELD_TYPE_STRING -> cursor.getString(i)
                        else -> throw IllegalStateException("Unexpected Room backup type")
                    }
                    values.put(v)
                }
                val line=values.toString()
                require(line.length<=MAX_LINE){"Oversized Room record"}
                out.write(line)
                out.newLine()
            }
        }
        out.flush()
        zip.closeEntry()
        return count
    }
    /**
     * Zip is encrypted BEFORE it touches the filesystem, so even an abrupt
     * crash cannot strand a plaintext research export in Android cache.
     */
    private fun makeEncrypted(context:Context,password:CharArray,uiIds:List<String>):Pair<File,JSONObject> {
        securePassword(password)
        val app=context.applicationContext
        val settings=kotlinx.coroutines.runBlocking { ApexPreferences.read(app) }
        val db=ApexDatabase.get(app)
        val temp=File.createTempFile("apex-encrypted-", ".apexbackup",app.cacheDir)
        try {
            val salt=ByteArray(16).also{SecureRandom().nextBytes(it)}
            val iv=ByteArray(12).also{SecureRandom().nextBytes(it)}
            val cipher=aes(password,salt,Cipher.ENCRYPT_MODE,iv)
            val counts=countMap()
            FileOutputStream(temp).use { file ->
                file.write(MAGIC.toByteArray(StandardCharsets.US_ASCII))
                file.write(salt);file.write(iv)
                ZipOutputStream(BufferedOutputStream(
                    CipherOutputStream(file,cipher))).use { zip ->
                    db.runInTransaction {
                        zipText(zip,"settings.json",settingsJson(settings,uiIds).toString())
                        for((table,columns) in tableColumns)
                            counts.put(table,rowsToZip(
                                db.openHelper.writableDatabase,zip,table,columns))
                        zipText(zip,"manifest.json",JSONObject()
                            .put("format",FORMAT)
                            .put("schemaVersion",5)
                            .put("exportedAt",System.currentTimeMillis())
                            .put("tableCounts",counts).toString())
                    }
                }
            }
            require(temp.length() in 40..MAX_ZIP){
                "Зашифрованный архив слишком большой"
            }
            return temp to counts
        }catch(e:Exception){temp.delete();throw e}
    }
    /**
     * SAF provider performs the actual cloud upload; an app can confirm only
     * that the selected document stream was written and closed successfully.
     */
    fun exportTo(context:Context,uri:Uri,password:CharArray,
        uiIds:List<String>):JSONObject {
        val (encrypted,counts)=makeEncrypted(context,password,uiIds)
        try{
            val output=context.contentResolver.openOutputStream(uri,"w")
                ?:throw IllegalStateException("Облачный документ недоступен для записи")
            output.use { out ->
                FileInputStream(encrypted).use { input ->
                    input.copyTo(out,65536)
                }
                out.flush()
            }
            val p=context.getSharedPreferences("apex_portable_backup_status_v1",
                Context.MODE_PRIVATE)
            val at=System.currentTimeMillis()
            p.edit().putLong("lastExportAt",at).apply()
            return JSONObject().put("saved",true).put("writtenAt",at)
                .put("counts",counts)
                .put("note","Проверьте завершение загрузки в выбранном облаке")
        }finally{encrypted.delete()}
    }
    private fun decodeToZip(context:Context,uri:Uri,password:CharArray):File {
        securePassword(password)
        val temp=File.createTempFile("apex-import-", ".zip",context.cacheDir)
        try {
            val input=context.contentResolver.openInputStream(uri)
                ?:throw IllegalStateException("Не удалось открыть файл")
            input.use {inputStream ->
                BufferedInputStream(inputStream).use {stream ->
                    val header=ByteArray(8+16+12)
                    var off=0
                    while(off<header.size){
                        val n=stream.read(header,off,header.size-off)
                        if(n<0)throw IllegalArgumentException("Повреждённый заголовок")
                        off+=n
                    }
                    require(String(header,0,8,StandardCharsets.US_ASCII)==MAGIC){
                        "Это не архив APEX"
                    }
                    val salt=header.copyOfRange(8,24)
                    val iv=header.copyOfRange(24,36)
                    val cipher=aes(password,salt,Cipher.DECRYPT_MODE,iv)
                    // The AES-GCM tag is verified at EOF before ZipFile is opened.
                    CipherInputStream(stream,cipher).use { decrypted ->
                        FileOutputStream(temp).use {output ->
                            val buffer=ByteArray(65536)
                            var total=0L
                            while(true){
                                val n=decrypted.read(buffer)
                                if(n<0)break
                                total+=n
                                require(total<=MAX_ZIP){"Архив больше допустимого"}
                                output.write(buffer,0,n)
                            }
                        }
                    }
                }
            }
            return temp
        }catch(e:Exception){temp.delete();throw e}
    }
    private fun textEntry(zip:ZipFile,name:String,limit:Int=65536):String {
        val e=zip.getEntry(name)?:throw IllegalArgumentException("Нет $name")
        require(e.size in 0..limit.toLong() || e.size==-1L){"Oversized entry"}
        return zip.getInputStream(e).use {input ->
            val out=java.io.ByteArrayOutputStream()
            val chunk=ByteArray(4096)
            while(true){
                val n=input.read(chunk)
                if(n<0)break
                require(out.size()+n<=limit){"Oversized entry"}
                out.write(chunk,0,n)
            }
            String(out.toByteArray(),StandardCharsets.UTF_8)
        }
    }
    private fun forEachRow(zip:ZipFile,table:String,
        columns:List<String>,action:(List<Any?>)->Unit):Long {
        val entry=zip.getEntry(zipName(table))
            ?:throw IllegalArgumentException("Нет таблицы $table")
        var count=0L
        zip.getInputStream(entry).bufferedReader(StandardCharsets.UTF_8).use{reader ->
            while(true) {
                val raw=reader.readLine()?:break
                count++
                require(count<=MAX_LINES&&raw.length<=MAX_LINE) {
                    "Слишком большой или повреждённый архив $table"
                }
                val array=JSONArray(raw)
                require(array.length()==columns.size){"Wrong Room schema"}
                val values=(0 until array.length()).map{idx ->
                    val item=array.get(idx)
                    when(item){
                        JSONObject.NULL -> null
                        is String,is Long,is Int,is Double -> item
                        else -> throw IllegalArgumentException("Invalid row value")
                    }
                }
                action(values)
            }
        }
        return count
    }
    private fun verify(zip:ZipFile):Pair<JSONObject,JSONObject> {
        val allowed=(tableColumns.keys.map{zipName(it)}+
            listOf("settings.json","manifest.json")).toSet()
        val present=zip.entries().toList().map{it.name}
        require(present.size==allowed.size&&present.toSet()==allowed){
            "Архив содержит неизвестные файлы или неполную структуру"
        }
        val manifest=JSONObject(textEntry(zip,"manifest.json"))
        require(manifest.optString("format")==FORMAT&&
            manifest.optInt("schemaVersion")==5&&
            manifest.optLong("exportedAt")>0){"Несовместимая версия архива"}
        val counts=manifest.optJSONObject("tableCounts")
            ?:throw IllegalArgumentException("Нет контрольных счётчиков")
        val settings=JSONObject(textEntry(zip,"settings.json"))
        // Validate settings and table counts BEFORE any Room modification.
        ApexPreferences.validateRestore(settings)
        var total=0L
        for((table,cols)in tableColumns){
            val expected=counts.optLong(table,-1L)
            require(expected in 0..MAX_LINES){"Invalid table count"}
            val found=forEachRow(zip,table,cols){ values ->
                var size=0L
                for(v in values)size+=when(v){
                    is String -> v.length.toLong()*2L
                    else -> 16L
                }
                require(size<=MAX_LINE*2L){"Oversized archived record"}
            }
            total+=found
            require(total<=MAX_LINES&&expected==found){"Неполная таблица $table"}
        }
        return manifest to settings
    }
    private fun merge(zip:ZipFile,context:Context):JSONObject {
        val app=context.applicationContext
        val db=ApexDatabase.get(app)
        val changed=JSONObject()
        db.runInTransaction {
            val sqlite=db.openHelper.writableDatabase
            for((table,columns)in tableColumns){
                val sql="INSERT OR IGNORE INTO "+table+
                    " ("+columns.joinToString(",")+") VALUES ("+
                    columns.joinToString(","){"?"}+")"
                val count=forEachRow(zip,table,columns){values ->
                    sqlite.execSQL(sql,values.toTypedArray())
                }
                changed.put(table,count)
            }
        }
        return changed
    }
    /** Always merges; never clears forecasts, Room tables, or favorites. */
    fun restoreFrom(context:Context,uri:Uri,password:CharArray):JSONObject {
        val zipFile=decodeToZip(context.applicationContext,uri,password)
        try {
            ZipFile(zipFile).use {zip ->
                val (manifest,settings)=verify(zip)
                // All authenticated bytes and row counts verified. DB applies
                // transactionally. Old immutable forecast IDs remain protected.
                val scanned=merge(zip,context)
                kotlinx.coroutines.runBlocking {
                    ApexPreferences.restoreFromBackup(context.applicationContext,settings)
                }
                return JSONObject().put("restored",true)
                    .put("uiMarkedIds",settings.optJSONArray("uiMarkedIds")?:JSONArray())
                    .put("exportedAt",manifest.getLong("exportedAt"))
                    .put("mergedRows",scanned)
                    .put("note","Объединено с существующей базой. Перезапустите APEX.")
            }
        }finally{zipFile.delete()}
    }
    fun status(context:Context):JSONObject {
        val prefs=context.getSharedPreferences("apex_portable_backup_status_v1",
            Context.MODE_PRIVATE)
        return JSONObject().put("available",true)
            .put("lastWrittenAt",prefs.getLong("lastExportAt",0L))
            .put("format",FORMAT)
            .put("mode","MANUAL_CLOUD_DOCUMENT_PICKER")
    }
}
