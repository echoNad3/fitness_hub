package com.echonad3.fitnesshub;

import org.junit.Test;
import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class BackupFileIOTest {
    private final byte[] backup = "{\"name\":\"Treniņš 💪\",\"sessions\":[1,2,3]}".getBytes(StandardCharsets.UTF_8);

    @Test public void commitsBeforeReadingAndPreservesUtf8() throws Exception {
        final byte[][] committed = { new byte[0] };
        BackupFileIO.writeAndVerify(backup, () -> new ByteArrayOutputStream() {
            @Override public void close() { committed[0] = toByteArray(); }
        }, () -> new ByteArrayInputStream(committed[0]));
        assertArrayEquals(backup, committed[0]);
    }

    @Test public void rejectsEmptyTruncatedCorruptAndOversizedResults() {
        byte[][] badResults = { new byte[0], Arrays.copyOf(backup, backup.length - 1),
                new byte[backup.length], Arrays.copyOf(backup, backup.length + 1) };
        for (byte[] bad : badResults) {
            assertThrows(IOException.class, () -> BackupFileIO.writeAndVerify(backup,
                    ByteArrayOutputStream::new, () -> new ByteArrayInputStream(bad)));
        }
    }

    @Test public void closeFailureNeverReportsSuccess() {
        assertThrows(IOException.class, () -> BackupFileIO.writeAndVerify(backup,
                () -> new ByteArrayOutputStream() {
                    @Override public void close() throws IOException { throw new IOException("Provider close failed"); }
                }, () -> { fail("Verification must not start after a failed close"); return null; }));
    }

    @Test public void writeFailureAndMissingStreamsAreRejected() {
        assertThrows(IOException.class, () -> BackupFileIO.writeAndVerify(backup,
                () -> new OutputStream() {
                    @Override public void write(int value) throws IOException { throw new IOException("Disk full"); }
                }, () -> new ByteArrayInputStream(backup)));
        assertThrows(IOException.class, () -> BackupFileIO.writeAndVerify(backup, () -> null,
                () -> new ByteArrayInputStream(backup)));
        assertThrows(IOException.class, () -> BackupFileIO.writeAndVerify(backup, ByteArrayOutputStream::new, () -> null));
    }

    @Test public void invalidPayloadCannotOpenDestination() {
        for (byte[] invalid : new byte[][] { new byte[0], new byte[BackupFileIO.MAX_BYTES + 1] }) {
            assertThrows(IOException.class, () -> BackupFileIO.writeAndVerify(invalid,
                    () -> { fail("Invalid payload must not create a file"); return null; }, () -> null));
        }
    }

    @Test public void readsAreBoundedAndLargeBackupRoundTrips() throws Exception {
        byte[] large = new byte[2 * 1024 * 1024];
        Arrays.fill(large, (byte) 'a');
        assertArrayEquals(large, BackupFileIO.read(new ByteArrayInputStream(large)));
        ByteArrayOutputStream destination = new ByteArrayOutputStream();
        BackupFileIO.writeAndVerify(large, () -> destination,
                () -> new ByteArrayInputStream(destination.toByteArray()));
        assertThrows(IOException.class, () -> BackupFileIO.read(new ByteArrayInputStream(new byte[BackupFileIO.MAX_BYTES + 1])));
    }
}
