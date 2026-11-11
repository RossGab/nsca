package com.nsca.driver.wip;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;

@CapacitorPlugin(name="DriverExport")
public class DriverExportPlugin extends Plugin {
    @PluginMethod public void savePart(PluginCall call) {
        getBridge().execute(() -> {
            Uri created=null; File temporary=null;
            try (NativeDriverStore store=new NativeDriverStore(getContext())) {
                String name=call.getString("name","export.json").replaceAll("[^a-zA-Z0-9._-]","_");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values=new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME,name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE,"application/json");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/NSCA Driver WIP");
                    values.put(MediaStore.MediaColumns.IS_PENDING,1);
                    created=getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
                    if(created==null) throw new IOException("Cannot create export file");
                    try(OutputStream output=getContext().getContentResolver().openOutputStream(created)) {
                        if(output==null)throw new IOException("Cannot open export file");
                        write(store,output,call);
                    }
                    values.clear();values.put(MediaStore.MediaColumns.IS_PENDING,0);
                    if(getContext().getContentResolver().update(created,values,null,null)!=1)throw new IOException("Cannot finalize export");
                } else {
                    File dir=new File(getContext().getFilesDir(),"driver-backups");
                    if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("Cannot create export folder");
                    temporary=File.createTempFile("export-",".tmp",dir);
                    try(FileOutputStream output=new FileOutputStream(temporary)) { write(store,output,call);output.getFD().sync(); }
                    if(!temporary.renameTo(new File(dir,name)))throw new IOException("Cannot finalize export");
                }
                call.resolve(new JSObject().put("saved",true));
            } catch(Exception | OutOfMemoryError error) {
                if(created!=null)try{getContext().getContentResolver().delete(created,null,null);}catch(Exception ignored){}
                call.reject("Export part could not be saved: "+error.getMessage());
            } finally { if(temporary!=null&&temporary.exists())temporary.delete(); }
        });
    }
    private void write(NativeDriverStore store,OutputStream output,PluginCall call) throws Exception {
        store.streamExport(output,call.getArray("taskIds",new JSArray()),call.getString("driverId",""),
            call.getString("exportedAt",""),call.getInt("partNumber",1),call.getInt("totalParts",1));
    }
}
