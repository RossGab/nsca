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
}
