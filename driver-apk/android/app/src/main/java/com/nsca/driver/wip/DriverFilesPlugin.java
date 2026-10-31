package com.nsca.driver.wip;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import android.os.Build;
import android.os.Environment;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;

@CapacitorPlugin(name = "DriverFiles")
public class DriverFilesPlugin extends Plugin {
    @PluginMethod
    public void saveAutomatic(PluginCall call) {
        getBridge().execute(() -> {
            Uri created = null;
            try {
                String name = call.getString("name", "driver-backup").replaceAll("[^a-zA-Z0-9._-]", "_");
                String mime = call.getString("mime", "application/octet-stream");
                byte[] bytes = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    boolean image = mime.startsWith("image/");
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/NSCA Driver WIP");
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    created = getContext().getContentResolver().insert(
                        image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (created == null) throw new IllegalStateException("Cannot create backup");
                    try (OutputStream output = getContext().getContentResolver().openOutputStream(created)) {
                        if (output == null) throw new IllegalStateException("Cannot open backup");
                        output.write(bytes);
                        output.flush();
                    }
                    values.clear();
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(created, values, null, null);
                } else {
                    File directory = new File(getContext().getFilesDir(), "driver-backups");
                    if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot create backup folder");
                    File temporary = File.createTempFile("backup-", ".tmp", directory);
                    try {
                        try (FileOutputStream output = new FileOutputStream(temporary)) {
                            output.write(bytes);
                            output.getFD().sync();
                        }
                        if (!temporary.renameTo(new File(directory, name))) throw new IllegalStateException("Cannot finish backup");
                    } finally { if (temporary.exists()) temporary.delete(); }
                }
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception error) {
                if (created != null) {
                    try { getContext().getContentResolver().delete(created, null, null); } catch (Exception ignored) {}
                }
                call.reject("Could not save automatic backup: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "driver-export"));
        startActivityForResult(call, intent, "savedFile");
    }

    @ActivityCallback
    private void savedFile(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("File was not saved. Please retry the export.");
            return;
        }
        getBridge().execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(result.getData().getData(), "wt")) {
                if (output == null) throw new IllegalStateException("Cannot open the selected file");
                output.write(Base64.decode(call.getString("base64", ""), Base64.DEFAULT));
                output.flush();
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception error) {
                call.reject("Could not save file: " + error.getMessage(), error);
            }
        });
    }
}
