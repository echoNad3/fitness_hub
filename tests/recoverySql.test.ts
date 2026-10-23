import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'

test('real PostgreSQL recovery migration, retention, tombstones, and account isolation', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'), ('${other}');
      create role anon; create role authenticated;
      grant usage on schema auth to authenticated;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `)
    // Start with the old schema and an existing protected copy, then apply twice.
    await db.exec(`create table public.app_recovery_snapshots (
      user_id uuid not null references auth.users(id), id text not null, created_at timestamptz not null,
      reason text not null, data_hash text not null, data jsonb not null, primary key(user_id, id));
      insert into public.app_recovery_snapshots values
        ('${owner}', 'legacy', now() - interval '2 days', 'before-cloud-replace', 'legacy-hash', '{"sessions":[]}');`)
    const sql = await readFile('supabase/recovery_snapshots.sql', 'utf8')
    await db.exec(sql)
    await db.exec(sql)

    await t.test('legacy and manual copies survive routine count retention', async () => {
      await db.query(`insert into public.app_recovery_snapshots
        (user_id,id,created_at,reason,data_hash,data,retention) values
        ($1,'manual',now() - interval '1 day','manual','manual','{}','protected')`, [owner])
      for (let index = 1; index <= 35; index++) {
        await db.query(`insert into public.app_recovery_snapshots
          (user_id,id,created_at,reason,data_hash,data,retention)
          values ($1,$2,now() + ($3::text || ' seconds')::interval,'before-workout-edit',$2,'{}','rolling')`,
          [owner, `routine-${index}`, index])
      }
      const rows = await db.query<{ id: string; retention: string }>("select id,coalesce(retention,'protected') as retention from public.app_recovery_snapshots")
      assert.equal(rows.rows.length, 22)
      assert.equal(rows.rows.find(row => row.id === 'legacy')?.retention, 'protected')
      assert.equal(rows.rows.some(row => row.id === 'manual'), true)
      assert.equal((await db.query('select id from public.app_recovery_deletions')).rows.length, 15)
    })

    await t.test('automatic copies are limited to three within the overall rolling limit', async () => {
      for (let index = 1; index <= 5; index++) {
        await db.query(`insert into public.app_recovery_snapshots
          (user_id,id,created_at,reason,data_hash,data,retention)
          values ($1,$2,now() + ($3::text || ' seconds')::interval,'automatic',$2,'{}','rolling')`,
          [owner, `auto-${index}`, index + 40])
      }
      assert.equal((await db.query("select id from public.app_recovery_snapshots where reason='automatic'")).rows.length, 3)
      assert.equal((await db.query("select id from public.app_recovery_snapshots where retention='rolling'")).rows.length, 20)
    })

    await t.test('an old offline client cannot resurrect a deleted copy', async () => {
      await db.query(`insert into public.app_recovery_snapshots
        (user_id,id,created_at,reason,data_hash,data)
        values ($1,'routine-1',now(),'before-workout-edit','old','{}')`, [owner])
      assert.equal((await db.query("select id from public.app_recovery_snapshots where id='routine-1'")).rows.length, 0)
    })

    await t.test('pinned automatic copies survive retention, older clients, and repeated migrations', async () => {
      await db.query("update public.app_recovery_snapshots set retention='protected' where id='auto-5'")
      await db.query(`insert into public.app_recovery_snapshots
        (user_id,id,created_at,reason,data_hash,data)
        values ($1,'auto-5',now(),'automatic','old-client','{}')
        on conflict(user_id,id) do update set retention=excluded.retention`, [owner])
      await db.exec(sql)
      for (let index = 6; index <= 10; index++) {
        await db.query(`insert into public.app_recovery_snapshots
          (user_id,id,created_at,reason,data_hash,data,retention)
          values ($1,$2,now() + ($3::text || ' seconds')::interval,'automatic',$2,'{}','rolling')`,
          [owner, `auto-${index}`, index + 40])
      }
      assert.equal((await db.query<{ retention: string }>("select retention from public.app_recovery_snapshots where id='auto-5'")).rows[0].retention, 'protected')
    })

    await t.test('large rolling payloads obey the byte budget without removing protected copies', async () => {
      for (let index = 1; index <= 4; index++) {
        const data = JSON.stringify({ sessions: [], payload: randomBytes(7 * 1024 * 1024).toString('base64') })
        await db.query(`insert into public.app_recovery_snapshots
          (user_id,id,created_at,reason,data_hash,data,retention)
          values ($1,$2,now() + ($3::text || ' seconds')::interval,'before-cloud-replace',$2,$4,'rolling')`,
          [owner, `large-${index}`, index + 100, data])
      }
      const size = await db.query<{ bytes: number }>("select sum(pg_column_size(data))::integer as bytes from public.app_recovery_snapshots where retention='rolling'")
      assert.ok(size.rows[0].bytes <= 20 * 1024 * 1024)
      assert.equal((await db.query("select id from public.app_recovery_snapshots where id in ('legacy','manual')")).rows.length, 2)
      assert.equal((await db.query("select id from public.app_recovery_snapshots where id='large-4'")).rows.length, 1)
    })

    await t.test('authenticated and anonymous clients cannot read another account', async () => {
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${other}';`)
      assert.equal((await db.query('select id from public.app_recovery_snapshots')).rows.length, 0)
      await assert.rejects(db.query(`insert into public.app_recovery_snapshots
        (user_id,id,created_at,reason,data_hash,data) values ($1,'cross-account',now(),'manual','x','{}')`, [owner]), /row-level security/)
      await db.exec('reset role; set role anon;')
      await assert.rejects(db.query('select id from public.app_recovery_snapshots'), /permission denied/)
      await db.exec('reset role;')
    })
  } finally { await db.close() }
})
