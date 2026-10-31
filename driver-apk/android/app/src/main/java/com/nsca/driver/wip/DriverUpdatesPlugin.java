package com.nsca.driver.wip;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "DriverUpdates")
public class DriverUpdatesPlugin extends Plugin {
    @PluginMethod
    public void check(PluginCall call) {
        getBridge().execute(() -> {
            HttpURLConnection connection = null;
            try {
                PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
                JSObject result = new JSObject();
                result.put("installedCode", info.versionCode);
                result.put("installedName", info.versionName);
                connection = (HttpURLConnection) URI.create("https://github.com/RossGab/nsca/releases/latest/download/driver-update.json").toURL().openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setRequestProperty("User-Agent", "NSCA-Driver-WIP");
                connection.setUseCaches(false);
                int code = connection.getResponseCode();
                if (code == 404) {
                    result.put("published", false);
                } else if (code == 200) {
                    try (var input = connection.getInputStream()) {
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        byte[] buffer = new byte[4096];
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (output.size() + count > 65536) throw new IllegalStateException("Update manifest too large");
                            output.write(buffer, 0, count);
                        }
                        byte[] bytes = output.toByteArray();
                        result.put("manifest", new JSObject(new String(bytes, StandardCharsets.UTF_8)));
                        result.put("published", true);
                    }
                } else throw new IllegalStateException("Update server unavailable");
                call.resolve(result);
            } catch (Exception error) { call.reject("Could not check for app updates", error); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    @PluginMethod
    public void openDownload(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.matches("https://github\\.com/RossGab/nsca/releases/download/driver-wip-v[0-9]+/driver-wip\\.apk")) {
            call.reject("Invalid update URL");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                call.resolve();
            } catch (Exception error) { call.reject("Could not open APK download", error); }
        });
    }
}
