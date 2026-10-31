package com.nsca.driver.wip;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.UUID;

/** Private SQLite records with immutable photo files. No browser storage dependency. */
public final class NativeDriverStore extends SQLiteOpenHelper {
    private final File photos;
    private final Context context;
    public NativeDriverStore(Context context) {
        super(context, "driver-native.sqlite", null, 1);
        this.context = context;
        photos = new File(context.getFilesDir(), "driver-photos");
    }
    @Override public void onConfigure(SQLiteDatabase db) { db.execSQL("PRAGMA synchronous=FULL"); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE records (store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, task_key TEXT, PRIMARY KEY(store,id))");
        db.execSQL("CREATE INDEX photo_task ON records(store,task_key)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported driver database upgrade");
    }
    private void storeName(String name) {
        if (!name.equals("tasks") && !name.equals("photos") && !name.equals("prefs") && !name.equals("meta")) throw new IllegalArgumentException("Unknown store");
    }
    public synchronized JSONObject get(String store, String id) throws Exception {
        storeName(store);
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT data FROM records WHERE store=? AND id=?", new String[]{store, id})) {
            return cursor.moveToFirst() ? new JSONObject(cursor.getString(0)) : null;
        }
    }
    public synchronized JSONArray list(String store, String taskKey) throws Exception {
        storeName(store);
        JSONArray result = new JSONArray();
        String where = taskKey == null ? "store=?" : "store=? AND task_key=?";
        String[] args = taskKey == null ? new String[]{store} : new String[]{store, taskKey};
        try (Cursor cursor = getReadableDatabase().query("records", new String[]{"data"}, where, args, null, null, "id")) {
            while (cursor.moveToNext()) result.put(new JSONObject(cursor.getString(0)));
        }
        return result;
    }
    private void put(SQLiteDatabase db, String store, String id, JSONObject data) throws Exception {
        storeName(store);
        if (id.isEmpty()) throw new IllegalArgumentException("Missing record ID");
        ContentValues values = new ContentValues();
        values.put("store", store); values.put("id", id); values.put("data", data.toString());
        if (store.equals("photos")) values.put("task_key", data.getString("taskKey"));
        if (db.insertWithOnConflict("records", null, values, SQLiteDatabase.CONFLICT_REPLACE)==-1) throw new IllegalStateException("Record was not saved");
    }
    public synchronized void write(String store, JSONArray rows, boolean merge, boolean onlyMissing) throws Exception {
        if (store.equals("photos")) throw new IllegalArgumentException("Use photo writer");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (int i=0; i<rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String id = row.getString(store.equals("tasks") ? "_key" : "key");
                JSONObject old = get(store, id);
                if (onlyMissing && old != null) continue;
                JSONObject next = merge && old != null ? new JSONObject(old.toString()) : new JSONObject();
                for (var keys=row.keys(); keys.hasNext();) { String key=keys.next(); next.put(key,row.get(key)); }
                if (store.equals("tasks") && merge) {
                    long first = old == null ? 0 : old.optLong("localFirstStoredAt",0);
                    next.put("localFirstStoredAt", first > 0 ? first : System.currentTimeMillis());
                }
                put(db, store, id, next);
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    public static String digest(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value & 255));
        return hex.toString();
    }
    private File photoFile(JSONObject row) throws Exception {
        String filename = row.getString("nativeFile");
        if (!filename.matches("[a-f0-9-]+\\.bin")) throw new IllegalArgumentException("Invalid photo filename");
        return new File(photos, filename);
    }
    public synchronized byte[] photoBytes(JSONObject row) throws Exception {
        try (FileInputStream input = new FileInputStream(photoFile(row)); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384]; int count;
            while ((count=input.read(buffer)) != -1) output.write(buffer,0,count);
            byte[] bytes=output.toByteArray();
            if (bytes.length != row.getLong("blobSize") || !digest(bytes).equals(row.getString("sha256"))) throw new IllegalStateException("Saved photo failed integrity check");
            return bytes;
        }
    }
    public synchronized JSONObject writePhoto(JSONObject metadata, byte[] bytes, boolean onlyMissing) throws Exception {
        String id=metadata.getString("id");
        JSONObject old=get("photos",id);
        if (onlyMissing && old != null) { photoBytes(old); return old; }
        if (!photos.isDirectory() && !photos.mkdirs()) throw new IllegalStateException("Cannot create photo folder");
        File file=new File(photos, UUID.randomUUID().toString()+".bin");
        boolean committed=false;
        try {
            try (FileOutputStream output=new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
            JSONObject row=new JSONObject(metadata.toString());
            row.remove("blob"); row.put("nativeFile",file.getName()); row.put("blobSize",bytes.length); row.put("sha256",digest(bytes));
            SQLiteDatabase db=getWritableDatabase();
            db.beginTransaction();
            try { put(db,"photos",id,row); db.setTransactionSuccessful(); }
            finally { db.endTransaction(); }
            committed=true;
            if (old != null) photoFile(old).delete();
            return row;
        } finally { if (!committed) file.delete(); }
    }
    public synchronized void delete(String store, String id) throws Exception {
        storeName(store);
        JSONObject old=get(store,id);
        getWritableDatabase().delete("records","store=? AND id=?",new String[]{store,id});
        if (store.equals("photos") && old != null) photoFile(old).delete();
    }
    public synchronized void submitPhotos(String taskKey) throws Exception {
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            JSONArray rows=list("photos",taskKey);
            for (int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); row.put("submitIntent",true); put(db,"photos",row.getString("id"),row); }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    public synchronized void prune(JSONArray keys) throws Exception {
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            for (int i=0;i<keys.length();i++) {
                String id=keys.getString(i); JSONObject task=get("tasks",id);
                if (task!=null && task.optString("status","PENDING").equals("PENDING") && list("photos",id).length()==0) db.delete("records","store=? AND id=?",new String[]{"tasks",id});
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    public synchronized JSONObject stats() throws Exception {
        try (Cursor check=getReadableDatabase().rawQuery("PRAGMA quick_check",null)) {
            if (!check.moveToFirst() || !check.getString(0).equals("ok")) throw new IllegalStateException("Native database integrity check failed");
        }
        long photoSize=0;
        JSONArray rows=list("photos",null);
        for (int i=0;i<rows.length();i++) {
            JSONObject row=rows.getJSONObject(i);
            if (!photoFile(row).isFile() || photoFile(row).length()!=row.getLong("blobSize")) throw new IllegalStateException("A saved photo is missing or incomplete");
            photoSize+=row.getLong("blobSize");
        }
        return new JSONObject().put("tasks",list("tasks",null).length()).put("photos",rows.length())
            .put("usage",context.getDatabasePath("driver-native.sqlite").length()+photoSize)
            .put("freeBytes",context.getFilesDir().getUsableSpace()).put("backend","Android SQLite and app files");
    }
    public synchronized void resetMigration() throws Exception {
        JSONObject marker=get("meta","migration-v1");
        if(marker!=null && marker.optBoolean("complete")) throw new IllegalStateException("Native storage is already active");
        getWritableDatabase().delete("records",null,null);
        File[] staged=photos.listFiles();
        if(staged!=null) for(File file:staged) if(file.getName().matches("[a-f0-9-]+\\.bin")) file.delete();
    }
}
