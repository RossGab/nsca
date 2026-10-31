package com.nsca.driver.wip;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name="DriverStorage")
public class DriverStoragePlugin extends Plugin {
    private NativeDriverStore store;
    @Override public void load() { store=new NativeDriverStore(getContext()); }
    @PluginMethod public void request(PluginCall call) {
        getBridge().execute(() -> {
            try {
                JSObject result=new JSObject();
                String operation=call.getString("operation","");
                String name=call.getString("store","tasks");
                switch (operation) {
                    case "resetMigration": store.resetMigration(); break;
                    case "get": result.put("row",store.get(name,call.getString("id",""))); break;
                    case "list": result.put("rows",store.list(name,call.getString("taskKey"))); break;
                    case "write": store.write(name,call.getArray("rows",new com.getcapacitor.JSArray()),call.getBoolean("merge",false),call.getBoolean("onlyMissing",false)); break;
                    case "delete": store.delete(name,call.getString("id","")); break;
                    case "putPhoto": result.put("row",store.writePhoto(call.getObject("row"),Base64.decode(call.getString("base64",""),Base64.DEFAULT),call.getBoolean("onlyMissing",false))); break;
                    case "readPhoto": {
                        JSONObject row=store.get("photos",call.getString("id",""));
                        if(row!=null) { result.put("row",row); result.put("base64",Base64.encodeToString(store.photoBytes(row),Base64.NO_WRAP)); }
                        break;
                    }
                    case "checkPhoto": {
                        JSONObject row=store.get("photos",call.getString("id",""));
                        if(row==null) throw new IllegalStateException("Missing photo");
                        result.put("sha256",NativeDriverStore.digest(store.photoBytes(row))); break;
                    }
                    case "submitPhotos": store.submitPhotos(call.getString("taskKey","")); break;
                    case "prune": store.prune(call.getArray("ids",new com.getcapacitor.JSArray())); break;
                    case "stats": result=new JSObject(store.stats().toString()); break;
                    case "completeMigration": {
                        JSONObject stats=store.stats();
                        if(stats.getInt("tasks")!=call.getInt("tasks",-1) || stats.getInt("photos")!=call.getInt("photos",-1)) throw new IllegalStateException("Migration record counts do not match");
                        store.write("meta",new JSONArray().put(new JSONObject().put("key","migration-v1").put("complete",true)),false,false);
                        break;
                    }
                    default: throw new IllegalArgumentException("Unknown storage operation");
                }
                call.resolve(result);
            } catch(Exception error) { call.reject("Android storage: "+error.getMessage(),error); }
        });
    }
    @Override protected void handleOnDestroy() { if(store!=null) store.close(); }
}
