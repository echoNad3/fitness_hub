package com.echonad3.fitnesshub;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Stream operations shared by the Android document bridge and its JVM tests. */
final class BackupFileIO {
    static final int MAX_BYTES = 10 * 1024 * 1024;

    interface OutputFactory { OutputStream open() throws IOException; }
    interface InputFactory { InputStream open() throws IOException; }

    static byte[] read(InputStream input) throws IOException {
        if (input == null) throw new IOException("No input stream");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > MAX_BYTES) throw new IOException("Backup is too large");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    static void writeAndVerify(byte[] bytes, OutputFactory destination, InputFactory savedFile) throws IOException {
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IOException("Invalid backup size");
        // A provider may commit on close. Never acknowledge success while its stream is still open.
        try (OutputStream output = destination.open()) {
            if (output == null) throw new IOException("No output stream");
            output.write(bytes);
            output.flush();
        }
        try (InputStream input = savedFile.open()) {
            if (input == null) throw new IOException("No verification stream");
            byte[] buffer = new byte[8192];
            int offset = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (offset + count > bytes.length) throw new IOException("Backup verification failed");
                for (int index = 0; index < count; index++) {
                    if (buffer[index] != bytes[offset + index]) throw new IOException("Backup verification failed");
                }
                offset += count;
            }
            if (offset != bytes.length) throw new IOException("Backup verification failed");
        }
    }
}
