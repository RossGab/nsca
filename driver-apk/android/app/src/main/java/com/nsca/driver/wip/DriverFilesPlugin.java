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

@CapacitorPlugin(name = "DriverFiles")
public class DriverFilesPlugin extends Plugin {
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
