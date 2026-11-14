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
    private const val TRANSCRIPT_ENTRY = "ai-transcripts.json"
    private const val MAX_TRANSCRIPT_BYTES = 2400000
    private const val MAX_TRANSCRIPTS = 400
    private const val MAX_FEEDBACK_BYTES = 180000
    private const val MAX_PORTABLE_AI_BYTES = 2900000
    private fun exactKeys(o:JSONObject,vararg keys:String) {
        require(o.keys().asSequence().toSet()==keys.toSet())
    }
    private fun safeCount(o:JSONObject,key:String):Long {
        val value=o.get(key)
        require(value is Number)
        val n=value.toDouble()
        require(n.isFinite() && n>=0 && n<=9007199254740991.0 && n==kotlin.math.floor(n))
        return n.toLong()
    }
    private fun journalTime(o:JSONObject):Long {
        val n=safeCount(o,"at")
        require(n in 1..8640000000000000L)
        return n
    }
    private fun journalDigest(o:JSONObject):String {
        val value=o.get("digest")
        require(value is String && value.matches(Regex("^[a-f0-9]{64}$")))
        return value
    }
    private val metricKeys=listOf("total","exact","toleranceOnly","outside")
    private fun checkedLabMetrics(o:JSONObject,role:String):List<Long> {
        exactKeys(o,"role","total","exact","toleranceOnly","outside","exactPercent","tolerancePercent")
        require(o.get("role")==role)
        val values=metricKeys.map{safeCount(o,it)}
        val (total,exact,near,outside)=values
        require(exact+near+outside==total)
        for((key,n) in listOf("exactPercent" to exact,"tolerancePercent" to exact+near)){
            if(total==0L)require(o.isNull(key))
            else require(safeCount(o,key)==kotlin.math.floor(100.0*n/total+0.5).toLong())
        }
        return values
    }
    private fun checkedLab(raw:JSONObject) {
        exactKeys(raw,"version","entries")
        require(safeCount(raw,"version")==1L && raw.toString().toByteArray(StandardCharsets.UTF_8).size<=120000)
        val entries=raw.getJSONArray("entries")
        require(entries.length()<=40)
        val seen=mutableSetOf<Triple<String,String,Long>>()
        for(i in 0 until entries.length()){
            val e=entries.getJSONObject(i)
            exactKeys(e,"at","digest","result")
            journalTime(e);val digest=journalDigest(e)
            val r=e.getJSONObject("result")
            exactKeys(r,"policy","asset","models","cohorts","checkedClaims","unresolved","archiveConflicts","automaticModelCalls","productionRuleChanged")
            val p=r.getJSONObject("policy")
            exactKeys(p,"version","relativeTolerance","split")
            require(safeCount(p,"version")==2L && p.get("relativeTolerance") is Number &&
                p.getDouble("relativeTolerance")==0.000001 && p.get("split")=="SOURCE_ID_FNV1A_MOD5")
            val asset=r.get("asset")
            require(asset is String && (asset.isEmpty()||asset.matches(Regex("^[A-Z0-9]{2,16}USDT$"))) && seen.add(Triple(digest,asset,2L)))
            require(safeCount(r,"automaticModelCalls")==0L && r.get("productionRuleChanged")==false)
            for(k in listOf("checkedClaims","unresolved","archiveConflicts"))safeCount(r,k)
            val models=r.getJSONArray("models");val cohorts=r.getJSONArray("cohorts")
            require(models.length()==2 && cohorts.length()==2)
            for(j in 0..1){
                val role=listOf("GLM","Qwen")[j]
                val all=checkedLabMetrics(models.getJSONObject(j),role)
                val counts=(0..1).map{c->
                    val cohort=cohorts.getJSONObject(c)
                    exactKeys(cohort,"partition","models")
                    require(cohort.get("partition")==listOf("RESEARCH","CONTROL")[c])
                    val m=cohort.getJSONArray("models")
                    require(m.length()==2)
                    checkedLabMetrics(m.getJSONObject(j),role)
                }
                require(all.indices.all{k->all[k]==counts[0][k]+counts[1][k]})
            }
        }
    }
    private fun checkedRules(raw:JSONObject) {
        exactKeys(raw,"version","reviews")
        require(safeCount(raw,"version")==1L && raw.toString().toByteArray(StandardCharsets.UTF_8).size<=80000)
        val reviews=raw.getJSONArray("reviews")
        require(reviews.length()<=60)
        val seen=mutableSetOf<Triple<String,String,Long>>()
        for(i in 0 until reviews.length()){
            val r=reviews.getJSONObject(i)
            exactKeys(r,"ruleId","ruleVersion","role","digest","at","outcome")
            val id=r.getString("ruleId");val role=r.getString("role");val at=journalTime(r)
            require(id in setOf("REL_1E7","REL_1E6") && safeCount(r,"ruleVersion")==1L &&
                role in setOf("GLM","Qwen") && seen.add(Triple(id,role,at)))
            journalDigest(r)
            require(r.getString("outcome") in setOf("REVIEWED_NO_CHANGE","NEEDS_MORE_EVIDENCE","REJECT_FOR_NOW"))
        }
    }
    private fun checkedFeedback(raw:JSONObject):JSONObject {
        require(raw.keys().asSequence().toSet()==setOf("version","reviews") && raw.optInt("version")==1)
        require(raw.toString().toByteArray(StandardCharsets.UTF_8).size<=MAX_FEEDBACK_BYTES)
        val reviews=raw.getJSONArray("reviews")
        require(reviews.length()<=100)
        val identity=mutableSetOf<Pair<String,Long>>()
        for(i in 0 until reviews.length()){
            val r=reviews.getJSONObject(i)
            require(r.keys().asSequence().toSet()==setOf("taskId","at","outcome","affected","total","evidenceIds"))
            val task=r.getString("taskId")
            val k=JSONArray(task)
            val at=r.getLong("at")
            require(task.length<=200 && k.length()==4 &&
                k.getString(0) in setOf("SOURCE_ID_CONFLICT","UNRECOGNIZED_FORMAT","REPEATED_NUMERIC_DIFFERENCE","LOW_EXPLICIT_COVERAGE") &&
                k.getString(1).length<=40 && (k.isNull(2)||k.getString(2).length<=40) &&
                (k.isNull(3)||k.getString(3) in setOf("GLM","Qwen")) &&
                at in 1..9007199254740991L && identity.add(task to at))
            require(r.getString("outcome") in setOf("REQUIRES_REVIEW","ROUNDING_OR_FORMAT","SOURCE_INCONSISTENCY","INSUFFICIENT_EVIDENCE"))
            val affected=r.getLong("affected")
            val total=r.getLong("total")
            require(affected>=1 && total>=affected && total<=9007199254740991L)
            val ids=r.getJSONArray("evidenceIds")
            require(ids.length() in 1..8)
            val values=(0 until ids.length()).map{ids.getString(it)}
            require(values.all{it.length in 1..100} && values.toSet().size==values.size)
        }
        return raw
    }
    /** Only public evidence transcripts, not live sessions, credentials or quotas. */
    fun checkedTranscripts(raw:JSONObject):JSONObject {
        require(raw.optInt("version")==1) {"Unsupported transcript archive"}
        require(raw.toString().toByteArray(StandardCharsets.UTF_8).size<=MAX_PORTABLE_AI_BYTES)
        val rows=raw.optJSONArray("rows") ?: throw IllegalArgumentException("Missing transcript rows")
        require(JSONObject().put("version",1).put("rows",rows).toString().toByteArray(StandardCharsets.UTF_8).size<=MAX_TRANSCRIPT_BYTES)
        if(raw.has("feedback"))checkedFeedback(raw.getJSONObject("feedback"))
        require(raw.has("lab")==raw.has("rules"))
        if(raw.has("lab")){
            require(raw.has("feedback"))
            checkedLab(raw.getJSONObject("lab"))
            checkedRules(raw.getJSONObject("rules"))
        }
        require(rows.length()<=MAX_TRANSCRIPTS)
        val ids=mutableSetOf<String>()
        val now=System.currentTimeMillis()
        for(i in 0 until rows.length()){
            val row=rows.getJSONObject(i)
            val asset=row.getString("asset")
            val at=row.getLong("startedAt")
            val stage=row.getString("stage")
            require(asset.matches(Regex("^[A-Z0-9]{2,16}USDT$")) &&
                row.optInt("version")==1 && at in 1..(now+120000) &&
                row.getString("id")=="$asset:$at" && ids.add("$asset:$at") &&
                stage in setOf("ANALYST_READY","COMPLETE"))
            require(row.getString("analystText").trim().length in 15..2400)
            val allowed=mutableSetOf("version","id","asset","startedAt","stage","evidence","sourceIds","analystText")
            val evidence=row.getJSONArray("evidence")
            val sourceIds=row.getJSONArray("sourceIds")
            fun validateEvidence(items:JSONArray,cutoff:Long):List<String>{
                require(items.length() in 1..5)
                val sources=mutableListOf<String>()
                for(j in 0 until items.length()){
                    val e=items.getJSONObject(j)
                    require(e.keys().asSequence().toSet()==setOf("source_id","observed_at","text"))
                    val id=e.getString("source_id")
                    require(id.length in 1..100 && id.contains(":$asset:") &&
                        !sources.contains(id) && e.getLong("observed_at") in 1..(cutoff+120000) &&
                        e.getString("text").length in 1..1500)
                    sources.add(id)
                }
                return sources
            }
            val expected=validateEvidence(evidence,at)
            require((0 until sourceIds.length()).map{sourceIds.getString(it)}==expected)
            if(stage=="COMPLETE"){
                allowed.addAll(listOf("criticAt","criticText","criticEvidence"))
                val reviewed=row.getLong("criticAt")
                require(reviewed in at..(now+120000) && row.getString("criticText").trim().length in 15..2400)
                validateEvidence(row.getJSONArray("criticEvidence"),reviewed)
            }
            require(row.keys().asSequence().toSet()==allowed)
        }
        require(raw.keys().asSequence().toSet()==when{
            raw.has("lab")->setOf("version","rows","feedback","lab","rules")
            raw.has("feedback")->setOf("version","rows","feedback")
            else->setOf("version","rows")
        })
        return raw
    }
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
    private fun settingsJson(settings:ResearchSettings,uiIds:List<String>,hiddenIds:List<String>):JSONObject {
        val favourites=JSONArray()
        settings.favorites.forEach{favourites.put(it)}
        val marked=JSONArray()
        settings.alertMarkedIds.sorted().forEach{marked.put(it)}
        val ui=JSONArray()
        uiIds.forEach{ui.put(it)}
        val hidden=JSONArray()
        hiddenIds.forEach{hidden.put(it)}
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
            .put("uiHiddenIds",hidden)
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
    private fun makeEncrypted(context:Context,password:CharArray,
        uiIds:List<String>,hiddenIds:List<String>,transcripts:JSONObject?):Pair<File,JSONObject> {
        securePassword(password)
        val archive=transcripts?.let{checkedTranscripts(it)}
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
                        zipText(zip,"settings.json",settingsJson(settings,uiIds,hiddenIds).toString())
                        for((table,columns) in tableColumns)
                            counts.put(table,rowsToZip(
                                db.openHelper.writableDatabase,zip,table,columns))
                        if(archive!=null)zipText(zip,TRANSCRIPT_ENTRY,archive.toString())
                        zipText(zip,"manifest.json",JSONObject()
                            .put("format",FORMAT)
                            .put("schemaVersion",if(archive?.has("lab")==true)8 else if(archive?.has("feedback")==true)7 else if(archive!=null)6 else 5)
                            .put("labCount",archive?.optJSONObject("lab")?.optJSONArray("entries")?.length()?:0)
                            .put("rulesCount",archive?.optJSONObject("rules")?.optJSONArray("reviews")?.length()?:0)
                            .put("feedbackCount",archive?.optJSONObject("feedback")?.optJSONArray("reviews")?.length()?:0)
                            .put("transcriptCount",archive?.getJSONArray("rows")?.length()?:0)
                            .put("exportedAt",System.currentTimeMillis())
                            .put("tableCounts",counts).toString())
                    }
                }
            }
            require(temp.length() in 40L..MAX_ZIP){
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
        uiIds:List<String>,hiddenIds:List<String>,transcripts:JSONObject?=null):JSONObject {
        val (encrypted,counts)=makeEncrypted(context,password,uiIds,hiddenIds,transcripts)
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
                .put("transcriptCount",transcripts?.getJSONArray("rows")?.length()?:0)
                .put("feedbackCount",transcripts?.optJSONObject("feedback")?.optJSONArray("reviews")?.length()?:0)
                .put("labCount",transcripts?.optJSONObject("lab")?.optJSONArray("entries")?.length()?:0)
                .put("rulesCount",transcripts?.optJSONObject("rules")?.optJSONArray("reviews")?.length()?:0)
                .put("note","Проверьте завершение загрузки в выбранном облаке")
        }finally{encrypted.delete()}
    }
    private fun decodeToZip(context:Context,uri:Uri,password:CharArray):File {
        securePassword(password)
        // Recovery after a killed import: discard stale private plaintext.
        context.cacheDir.listFiles()?.filter {
            it.name.startsWith("apex-import-")&&
            System.currentTimeMillis()-it.lastModified()>60*60*1000L
        }?.forEach{it.delete()}
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
        val manifest=JSONObject(textEntry(zip,"manifest.json"))
        val schema=manifest.optInt("schemaVersion")
        require(schema==5||schema==6||schema==7||schema==8) {"Несовместимая версия архива"}
        val allowed=(tableColumns.keys.map{zipName(it)}+
            listOf("settings.json","manifest.json")+
            if(schema>=6)listOf(TRANSCRIPT_ENTRY) else emptyList()).toSet()
        val entries=zip.entries().toList()
        val present=entries.map{it.name}
        var expanded=0L
        for(entry in entries){
            require(entry.size>=0&&entry.size<=MAX_UNCOMPRESSED){
                "Повреждённый или чрезмерно большой файл архива"
            }
            expanded+=entry.size
            require(expanded<=MAX_UNCOMPRESSED){
                "Распакованный архив превышает допустимый объём"
            }
        }
        require(present.size==allowed.size&&present.toSet()==allowed){
            "Архив содержит неизвестные файлы или неполную структуру"
        }
        require(manifest.optString("format")==FORMAT&&
            (schema==5||schema==6||schema==7||schema==8)&&
            manifest.optLong("exportedAt")>0){"Несовместимая версия архива"}
        val counts=manifest.optJSONObject("tableCounts")
            ?:throw IllegalArgumentException("Нет контрольных счётчиков")
        val settings=JSONObject(textEntry(zip,"settings.json"))
        if(schema>=6){
            val history=checkedTranscripts(JSONObject(textEntry(zip,TRANSCRIPT_ENTRY,MAX_PORTABLE_AI_BYTES)))
            require(manifest.optInt("transcriptCount",-1)==history.getJSONArray("rows").length())
            require(history.has("feedback")== (schema>=7))
            require(history.has("lab")== (schema==8))
            if(schema>=7)require(manifest.optInt("feedbackCount",-1)==history.getJSONObject("feedback").getJSONArray("reviews").length())
            if(schema==8){
                require(manifest.optInt("labCount",-1)==history.getJSONObject("lab").getJSONArray("entries").length())
                require(manifest.optInt("rulesCount",-1)==history.getJSONObject("rules").getJSONArray("reviews").length())
            }
        }
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
                val settingsRestored=try{
                    kotlinx.coroutines.runBlocking {
                        ApexPreferences.restoreFromBackup(context.applicationContext,settings)
                    }
                    true
                }catch(_:Exception){false}
                return JSONObject().put("restored",true)
                    .put("settingsRestored",settingsRestored)
                    .put("uiMarkedIds",settings.optJSONArray("uiMarkedIds")?:JSONArray())
                    .put("uiHiddenIds",settings.optJSONArray("uiHiddenIds")?:JSONArray())
                    .put("exportedAt",manifest.getLong("exportedAt"))
                    .put("scannedRows",scanned)
                    .put("aiTranscripts",if(manifest.optInt("schemaVersion")>=6)
                        JSONObject(textEntry(zip,TRANSCRIPT_ENTRY,MAX_PORTABLE_AI_BYTES)) else JSONObject.NULL)
                    .put("note",if(settingsRestored)
                        "Исследования объединены, настройки перенесены. Перезапустите APEX."
                        else "История Room объединена, но настройки не перенесены; попробуйте восстановление ещё раз.")
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
