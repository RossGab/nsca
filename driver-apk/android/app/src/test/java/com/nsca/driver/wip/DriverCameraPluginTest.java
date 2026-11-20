package com.nsca.driver.wip;

import android.graphics.*;
import android.app.Activity;
import android.media.ExifInterface;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class DriverCameraPluginTest {
    private static class CaptureCall extends PluginCall {
        String rejection;
        JSObject resolved;
        CaptureCall() { super(null, "DriverCamera", "test", "capture", new JSObject().put("path", "test-photo")); }
        @Override public void reject(String message) { rejection = message; }
        @Override public void reject(String message, Exception error) { rejection = message; }
        @Override public void resolve(JSObject value) { resolved = value; }
    }
    private static class PermissionProbe extends DriverCameraPlugin {
        int permissionRequests;
        PermissionState state = PermissionState.PROMPT;
        @Override public PermissionState getPermissionState(String alias) { return state; }
        @Override protected void requestPermissionForAlias(String alias, PluginCall call, String callback) { permissionRequests++; }
    }
    @Test public void duplicateRequestsAreRejectedUntilCameraReturns() throws Exception {
        for (int outcome : new int[] { Activity.RESULT_OK, Activity.RESULT_CANCELED }) {
            PermissionProbe plugin = new PermissionProbe();
            CaptureCall original = new CaptureCall();
            plugin.capture(original);
            for (int index = 0; index < 3; index++) {
                CaptureCall duplicate = new CaptureCall();
                plugin.capture(duplicate);
                assertTrue(duplicate.rejection.contains("already"));
            }
            assertEquals(1, plugin.permissionRequests);
            java.lang.reflect.Method captured = DriverCameraPlugin.class.getDeclaredMethod("captured", PluginCall.class, ActivityResult.class);
            captured.setAccessible(true);
            captured.invoke(plugin, original, new ActivityResult(outcome, null));
            assertNotNull(original.resolved);
            plugin.capture(new CaptureCall());
            assertEquals(2, plugin.permissionRequests);
        }
    }
    @Test public void permissionDenialReleasesCaptureForRetry() throws Exception {
        PermissionProbe plugin = new PermissionProbe();
        CaptureCall call = new CaptureCall();
        plugin.capture(call);
        plugin.state = PermissionState.DENIED;
        java.lang.reflect.Method permission = DriverCameraPlugin.class.getDeclaredMethod("cameraPermission", PluginCall.class);
        permission.setAccessible(true);
        permission.invoke(plugin, call);
        assertTrue(call.rejection.contains("Allow camera"));
        plugin.capture(new CaptureCall());
        assertEquals(2, plugin.permissionRequests);
    }
    @Test public void cameraLaunchFailureReleasesCaptureForRetry() {
        PermissionProbe plugin = new PermissionProbe();
        plugin.state = PermissionState.GRANTED;
        CaptureCall failed = new CaptureCall();
        // No bridge is attached: camera launch fails and must release its lock.
        plugin.capture(failed);
        assertTrue(failed.rejection.contains("Unable to open"));
        plugin.state = PermissionState.PROMPT;
        plugin.capture(new CaptureCall());
        assertEquals(1, plugin.permissionRequests);
    }
    private File file() throws Exception {
        return File.createTempFile("driver-camera-test-", ".jpg", RuntimeEnvironment.getApplication().getCacheDir());
    }
    private void writeImage(File file, int w, int h) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.WHITE);
        try (FileOutputStream stream = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, stream); }
        bitmap.recycle();
    }
    @Test public void correctsExifRotationResizesAndAddsWatermark() throws Exception {
        File input=file(), output=file();
        try {
            writeImage(input, 2400, 1200);
            ExifInterface exif=new ExifInterface(input.getPath());
            exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6"); exif.saveAttributes();
            DriverCameraPlugin.processImage(input, output, 14.5, 121.1, "2026-11-10T00:00:00.000Z");
            Bitmap result=BitmapFactory.decodeFile(output.getPath());
            assertEquals(960, result.getWidth()); assertEquals(1920, result.getHeight());
            assertTrue(Color.red(result.getPixel(8, 1870)) < 230);
            assertTrue(output.length()>0); result.recycle();
        } finally { input.delete(); output.delete(); }
    }
    @Test public void doesNotUpscaleSmallPhotos() throws Exception {
        File input=file(), output=file();
        try {
            writeImage(input, 640, 480);
            DriverCameraPlugin.processImage(input, output, 14.5, 121.1, "2026-11-10T00:00:00.000Z");
            Bitmap result=BitmapFactory.decodeFile(output.getPath());
            assertEquals(640,result.getWidth()); assertEquals(480,result.getHeight()); result.recycle();
        } finally { input.delete(); output.delete(); }
    }
    @Test public void rejectsUnreadablePhoto() throws Exception {
        File input=file(), output=file();
        try {
            assertThrows(IOException.class, () -> DriverCameraPlugin.processImage(input, output, 14.5, 121.1, "2026-11-10T00:00:00.000Z"));
        } finally { input.delete(); output.delete(); }
    }
}
