package com.nsca.driver.wip;

import android.graphics.*;
import android.media.ExifInterface;
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
