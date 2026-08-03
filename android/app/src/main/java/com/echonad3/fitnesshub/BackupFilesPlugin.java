package com.echonad3.fitnesshub;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Opens Android's document picker for portable Fitness Hub JSON backups. */
@CapacitorPlugin(name = "BackupFiles")
public class BackupFilesPlugin extends Plugin {

    private static final int MAX_BACKUP_BYTES = 10 * 1024 * 1024;
    private static final String JSON_MIME = "application/json";

    @PluginMethod
    public void save(PluginCall call) {
        String contents = call.getString("contents");
        String filename = call.getString("filename", "fitness-hub-backup.json");
        if (contents == null || contents.getBytes(StandardCharsets.UTF_8).length > MAX_BACKUP_BYTES) {
            call.reject("The backup is too large to save.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(JSON_MIME)
                .putExtra(Intent.EXTRA_TITLE, safeFilename(filename));
        try {
            startActivityForResult(call, intent, "saveCallback");
        } catch (Exception error) {
            call.reject("Android's file picker is unavailable.", error);
        }
    }

    @ActivityCallback
    private void saveCallback(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            call.resolve(cancelledResult());
            return;
        }

        Uri uri = activityResult.getData().getData();
        String contents = call.getString("contents");
        if (uri == null || contents == null) {
            call.reject("No backup file was selected.");
            return;
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("No output stream");
            output.write(contents.getBytes(StandardCharsets.UTF_8));
            output.flush();
            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("The backup could not be saved.", error);
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("*/*")
                .putExtra(Intent.EXTRA_MIME_TYPES, new String[] { JSON_MIME, "text/plain", "application/octet-stream" });
        try {
            startActivityForResult(call, intent, "openCallback");
        } catch (Exception error) {
            call.reject("Android's file picker is unavailable.", error);
        }
    }

    @ActivityCallback
    private void openCallback(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            call.resolve(cancelledResult());
            return;
        }

        Uri uri = activityResult.getData().getData();
        if (uri == null) {
            call.reject("No backup file was selected.");
            return;
        }

        long declaredSize = fileSize(uri);
        if (declaredSize > MAX_BACKUP_BYTES) {
            call.reject("The backup file is too large.");
            return;
        }

        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("No input stream");
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BACKUP_BYTES) {
                    call.reject("The backup file is too large.");
                    return;
                }
                output.write(buffer, 0, read);
            }

            JSObject result = new JSObject();
            result.put("contents", output.toString(StandardCharsets.UTF_8.name()));
            result.put("name", fileName(uri));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("The backup file could not be read.", error);
        }
    }

    private long fileSize(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[] { OpenableColumns.SIZE },
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {
            // Some document providers do not expose a size. The bounded stream read still protects us.
        }
        return -1;
    }

    private String fileName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (Exception ignored) {
            // The name is only informational.
        }
        return "fitness-hub-backup.json";
    }

    private static String safeFilename(String filename) {
        String safe = filename.replaceAll("[^A-Za-z0-9._-]", "-");
        return safe.endsWith(".json") ? safe : safe + ".json";
    }

    private static JSObject cancelledResult() {
        JSObject result = new JSObject();
        result.put("cancelled", true);
        return result;
    }
}
