package com.nsca.driver.wip;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.graphics.*;
import android.media.ExifInterface;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;

@CapacitorPlugin(name = "DriverCamera", permissions = {
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
})
public class DriverCameraPlugin extends Plugin {
    @PluginMethod public void capture(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermission");
        } else launch(call);
    }
    @PermissionCallback private void cameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) launch(call);
        else call.reject("Allow camera access in Android settings to take a photo.");
    }
    private void launch(PluginCall call) {
        try {
            File file = File.createTempFile("driver-camera-", ".jpg", getContext().getCacheDir());
            call.getData().put("path", file.getAbsolutePath());
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", file));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(call, intent, "captured");
        } catch (Exception e) { call.reject("Unable to open the phone camera.", e); }
    }
    @ActivityCallback private void captured(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            try { cameraFile(call.getString("path")).delete(); } catch (Exception ignored) {}
            call.resolve(new JSObject().put("cancelled", true));
        } else call.resolve(new JSObject().put("path", call.getString("path")));
    }
    private File cameraFile(String path) throws IOException {
        if (path == null) throw new IOException("Missing camera file");
        File file = new File(path).getCanonicalFile();
        if (!file.getParentFile().equals(getContext().getCacheDir().getCanonicalFile()) ||
            !file.getName().startsWith("driver-camera-")) throw new IOException("Invalid camera file");
        return file;
    }
    @PluginMethod public void process(PluginCall call) {
        getBridge().execute(() -> {
            File output = null;
            try {
                File input = cameraFile(call.getString("path"));
                double lat = call.getDouble("latitude", Double.NaN), lng = call.getDouble("longitude", Double.NaN);
                if (!Double.isFinite(lat) || !Double.isFinite(lng)) throw new IOException("GPS is not ready. Please retry.");
                output = File.createTempFile("driver-camera-", ".jpg", getContext().getCacheDir());
                processImage(input, output, lat, lng, call.getString("takenAt"));
                call.resolve(new JSObject().put("path", output.getAbsolutePath()));
            } catch (Exception | OutOfMemoryError e) {
                if (output != null) output.delete();
                call.reject("Unable to process photo. Please retry: " + e.getMessage());
            }
        });
    }
    @PluginMethod public void release(PluginCall call) {
        try { cameraFile(call.getString("path")).delete(); call.resolve(); }
        catch (Exception e) { call.reject("Unable to release temporary photo", e); }
    }
    static void processImage(File input, File output, double lat, double lng, String takenAt) throws Exception {
        Bitmap source = null, rotated = null, target = null;
        try {
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(input.getPath(), opts);
            if (opts.outWidth <= 0 || opts.outHeight <= 0) throw new IOException("Unreadable photo");
            opts.inSampleSize = 1;
            while (Math.max(opts.outWidth, opts.outHeight) / (opts.inSampleSize * 2) >= 1920) opts.inSampleSize *= 2;
            opts.inJustDecodeBounds = false;
            source = BitmapFactory.decodeFile(input.getPath(), opts);
            if (source == null) throw new IOException("Unable to decode photo");
            int orientation = new ExifInterface(input.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            Matrix matrix = new Matrix();
            switch (orientation) {
                case 2: matrix.setScale(-1, 1); break;
                case 3: matrix.setRotate(180); break;
                case 4: matrix.setScale(1, -1); break;
                case 5: matrix.setRotate(90); matrix.postScale(-1, 1); break;
                case 6: matrix.setRotate(90); break;
                case 7: matrix.setRotate(270); matrix.postScale(-1, 1); break;
                case 8: matrix.setRotate(270); break;
            }
            rotated = Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
            float scale = Math.min(1f, 1920f / Math.max(rotated.getWidth(), rotated.getHeight()));
            target = Bitmap.createBitmap(Math.max(1, Math.round(rotated.getWidth()*scale)),
                Math.max(1, Math.round(rotated.getHeight()*scale)), Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(target);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            canvas.drawBitmap(rotated, null, new Rect(0, 0, target.getWidth(), target.getHeight()), paint);
            String coords = String.format(Locale.US, "%.6f, %.6f", lat, lng);
            SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            parser.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date date = parser.parse(takenAt);
            SimpleDateFormat format = new SimpleDateFormat("dd/MM/yyyy HH:mm:ss 'PH'", Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("Asia/Manila"));
            String stamp = format.format(date);
            float size = Math.max(12, target.getWidth()/45f), padding = 12;
            paint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            paint.setTextSize(size);
            float boxWidth = Math.max(paint.measureText(coords), paint.measureText(stamp)) + padding*2;
            float y = target.getHeight()-padding;
            paint.setColor(Color.argb(140, 0, 0, 0));
            canvas.drawRect(padding/2, y-size*2-padding*1.5f, padding/2+boxWidth, y, paint);
            paint.setColor(Color.WHITE);
            canvas.drawText(coords, padding, y-size-4, paint);
            canvas.drawText(stamp, padding, y, paint);
            try (FileOutputStream stream = new FileOutputStream(output)) {
                if (!target.compress(Bitmap.CompressFormat.JPEG, 85, stream)) throw new IOException("JPEG encoding failed");
            }
        } finally {
            if (target != null) target.recycle();
            if (rotated != null && rotated != source) rotated.recycle();
            if (source != null) source.recycle();
        }
    }
}
