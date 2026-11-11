package com.nsca.driver.wip;

import android.content.Context;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class NativeDriverStoreTest {
    private NativeDriverStore store;
    private Context context;
    @Before public void setup() { context=RuntimeEnvironment.getApplication(); context.deleteDatabase("driver-native.sqlite"); store=new NativeDriverStore(context); }
    @After public void teardown() { store.close(); }
    private JSONObject task(String id,String status) throws Exception { return new JSONObject().put("_key",id).put("dateKey","20261031").put("status",status); }
    private JSONObject photo(String id,String key) throws Exception { return new JSONObject().put("id",id).put("taskKey",key).put("photoIndex",1).put("submitIntent",false); }
    @Test public void recordsSurviveReopeningAndMergePreservesTaskFields() throws Exception {
        store.write("tasks",new JSONArray().put(task("one","PENDING").put("customerName","Original")),true,false);
        long first=store.get("tasks","one").getLong("localFirstStoredAt");
        store.close(); store=new NativeDriverStore(context);
        store.write("tasks",new JSONArray().put(new JSONObject().put("_key","one").put("status","LOCAL_COMPLETED")),true,false);
        JSONObject saved=store.get("tasks","one");
        assertEquals("Original",saved.getString("customerName"));
        assertEquals(first,saved.getLong("localFirstStoredAt"));
    }
    @Test public void failedBatchRollsBackEarlierRows() throws Exception {
        try { store.write("tasks",new JSONArray().put(task("ok","PENDING")).put(new JSONObject()),false,false); fail("Expected invalid row"); }
        catch(Exception expected) { assertNull(store.get("tasks","ok")); }
    }
    @Test public void fivePhotoSlotsPersistAndAllAreMarkedSubmitted() throws Exception {
        for(int index=1;index<=5;index++) store.writePhoto(photo("census_"+index,"census").put("photoIndex",index),new byte[]{(byte)index},false);
        store.close();store=new NativeDriverStore(context);
        assertEquals(5,store.list("photos","census").length());
        store.submitPhotos("census");
        for(int index=1;index<=5;index++) {
            JSONObject row=store.get("photos","census_"+index);
            assertEquals(index,row.getInt("photoIndex"));
            assertTrue(row.getBoolean("submitIntent"));
            assertArrayEquals(new byte[]{(byte)index},store.photoBytes(row));
        }
    }
    @Test public void photoReplacementAndSubmissionPreserveVerifiedBytes() throws Exception {
        byte[] first="first-photo".getBytes(StandardCharsets.UTF_8), second="second-photo".getBytes(StandardCharsets.UTF_8);
        JSONObject old=store.writePhoto(photo("one_1","one"),first,false);
        JSONObject next=store.writePhoto(photo("one_1","one"),second,false);
        assertFalse(new File(context.getFilesDir(),"driver-photos/"+old.getString("nativeFile")).exists());
        assertArrayEquals(second,store.photoBytes(next));
        store.submitPhotos("one");
        assertTrue(store.get("photos","one_1").getBoolean("submitIntent"));
        assertArrayEquals(second,store.photoBytes(store.get("photos","one_1")));
        store.delete("photos","one_1"); assertNull(store.get("photos","one_1"));
    }
    @Test public void pruningKeepsCompletedTasksAndTasksWithPhotos() throws Exception {
        store.write("tasks",new JSONArray().put(task("pending","PENDING")).put(task("photo","PENDING")).put(task("complete","LOCAL_COMPLETED")),false,false);
        store.writePhoto(photo("photo_1","photo"),new byte[]{1,2,3},false);
        store.prune(new JSONArray().put("pending").put("photo").put("complete"));
        assertNull(store.get("tasks","pending")); assertNotNull(store.get("tasks","photo")); assertNotNull(store.get("tasks","complete"));
    }
    @Test public void integrityCheckDetectsMissingPhotoAndCompletedMigrationCannotReset() throws Exception {
        JSONObject row=store.writePhoto(photo("one_1","one"),new byte[]{1},false);
        new File(context.getFilesDir(),"driver-photos/"+row.getString("nativeFile")).delete();
        try { store.stats(); fail("Missing photo must fail"); } catch(IllegalStateException expected) {}
        store.write("meta",new JSONArray().put(new JSONObject().put("key","migration-v1").put("complete",true)),false,false);
        try { store.resetMigration(); fail("Active data must never be reset"); } catch(IllegalStateException expected) {}
        assertNotNull(store.get("meta","migration-v1"));
    }

    @Test public void streamedExportPreservesImportFormatWithoutMarkingTasks() throws Exception {
        store.write("tasks",new JSONArray().put(task("export","LOCAL_COMPLETED").put("driverId","driver_001").put("deliveryData",new JSONObject().put("remarks","Test"))),false,false);
        byte[] bytes=new byte[50003]; for(int i=0;i<bytes.length;i++) bytes[i]=(byte)i;
        store.writePhoto(photo("export_5","export").put("photoIndex",5).put("mime","image/jpeg"),bytes,false);
        java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();
        store.streamExport(output,new JSONArray().put("export"),"DRIVER_001","2026-11-11",1,2);
        JSONObject result=new JSONObject(output.toString("UTF-8"));
        assertEquals(1,result.getInt("totalTasks")); assertEquals(2,result.getInt("totalParts"));
        assertTrue(result.getJSONArray("tasks").getJSONObject(0).getBoolean("exported"));
        JSONObject image=result.getJSONArray("photos").getJSONObject(0);
        assertEquals(5,image.getInt("photoIndex"));
        assertEquals("Test",image.getJSONObject("deliveryData").getString("remarks"));
        String data=image.getString("base64"); assertTrue(data.startsWith("data:image/jpeg;base64,"));
        assertArrayEquals(bytes,android.util.Base64.decode(data.substring(data.indexOf(',')+1),android.util.Base64.DEFAULT));
        assertFalse(store.get("tasks","export").optBoolean("exported"));
    }
    @Test public void streamedExportRejectsWrongOwnerAndCorruptPhotos() throws Exception {
        store.write("tasks",new JSONArray().put(task("export","LOCAL_COMPLETED").put("driverId","driver_001")),false,false);
        JSONObject row=store.writePhoto(photo("export_1","export"),new byte[]{1,2,3},false);
        assertThrows(IllegalStateException.class,()->store.streamExport(new java.io.ByteArrayOutputStream(),new JSONArray().put("export"),"other","now",1,1));
        try(java.io.FileOutputStream output=new java.io.FileOutputStream(new File(context.getFilesDir(),"driver-photos/"+row.getString("nativeFile")))){output.write(new byte[]{4,5,6});}
        assertThrows(IllegalStateException.class,()->store.streamExport(new java.io.ByteArrayOutputStream(),new JSONArray().put("export"),"driver_001","now",1,1));
        assertFalse(store.get("tasks","export").optBoolean("exported"));
    }

    @Test public void exportedRetentionDeletesOnlyEligibleTasksAndTheirPhotos() throws Exception {
        long now=1800000000000L;
        java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US);
        format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        String expired=format.format(new java.util.Date(now-30L*86400000)), recent=format.format(new java.util.Date(now-29L*86400000));
        JSONArray rows=new JSONArray();
        for(String id:new String[]{"old","recent","legacy","unsent","other","receipt","confirmed"}) {
            JSONObject row=task(id,"LOCAL_COMPLETED").put("driverId",id.equals("other")?"other":"driver_001").put("exported",!id.equals("unsent"));
            if(!id.equals("legacy")) row.put("localExportedAt",id.equals("recent")?recent:expired);
            if(id.equals("receipt") || id.equals("confirmed")) row.put("offlineExport",new JSONObject().put("id","receipt-id"));
            if(id.equals("confirmed")) row.put("offlineExportConfirmed",new JSONObject().put("id","receipt-id"));
            rows.put(row);
        }
        store.write("tasks",rows,false,false);
        JSONObject evidence=store.writePhoto(photo("old_1","old"),new byte[]{1,2,3},false);
        store.writePhoto(photo("receipt_1","receipt"),new byte[]{4,5,6},false);
        JSONArray removed=store.cleanupExpiredExports("DRIVER_001",now);
        assertEquals(1,removed.length()); assertEquals("old",removed.getString(0));
        assertNull(store.get("tasks","old")); assertNull(store.get("photos","old_1"));
        assertFalse(new File(context.getFilesDir(),"driver-photos/"+evidence.getString("nativeFile")).exists());
        for(String id:new String[]{"recent","legacy","unsent","other","receipt","confirmed"}) assertNotNull(store.get("tasks",id));
        assertNotNull(store.get("photos","receipt_1"));
        assertEquals(format.format(new java.util.Date(now)),store.get("tasks","legacy").getString("localExportedAt"));
    }
}
