import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { applyVaultChanges } from '../src/server/sources/vault/index.js'
import { scanVault } from '../src/server/sources/vault/scan.js'
import { openDb } from '../src/server/db/index.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vault-'))
  await cp(join(import.meta.dirname, 'fixtures', 'vault'), root, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('scans markdown, keeps cyrillic paths, skips attachments', async () => {
  const entries = await scanVault(root)
  const paths = entries.map((entry) => entry.path).sort()
  expect(paths).toEqual([
    '01 Projects/Project Alpha.md',
    '02 Areas/🎓 Education/Лекции.md',
    'Inbox/Idea.md',
    'Templates/Template.md',
  ])
  expect(paths.every((path) => !path.includes('\\'))).toBe(true)
})

test('first scan indexes silently, later scans log nothing', async () => {
  const db = openDb(':memory:')
  const entries = await scanVault(root)

  expect(applyVaultChanges(db, 'v', entries)).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS n FROM vault_changes').get()).toEqual({ n: 0 })
  expect(applyVaultChanges(db, 'v', entries)).toBe(0)

  const file = join(root, 'Inbox', 'Idea.md')
  await writeFile(file, (await readFile(file, 'utf8')) + '- [ ] another idea\n')
  const edited = await scanVault(root)
  expect(applyVaultChanges(db, 'v', edited)).toBe(1)

  const change = db
    .prepare("SELECT path, added, removed FROM vault_changes WHERE path = 'Inbox/Idea.md' ORDER BY id DESC LIMIT 1")
    .get() as { path: string; added: number; removed: number }
  expect(change).toMatchObject({ path: 'Inbox/Idea.md', added: 1, removed: 0 })
})

test('a partial batch from the watcher does not treat other notes as deleted', async () => {
  const db = openDb(':memory:')
  const entries = await scanVault(root)
  applyVaultChanges(db, 'v', entries)

  const one = entries.find((entry) => entry.path === 'Inbox/Idea.md')!
  applyVaultChanges(db, 'v', [{ ...one, hash: 'changed', text: `${one.text}- [ ] watcher edit\n` }], new Date(), {
    reconcileDeletes: false,
  })

  expect(db.prepare('SELECT COUNT(*) AS n FROM vault_files').get()).toEqual({ n: 4 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM vault_changes').get()).toEqual({ n: 1 })
})

test('indexes tasks and drops them when the note is deleted', async () => {
  const db = openDb(':memory:')
  applyVaultChanges(db, 'v', await scanVault(root))
  const tasks = db.prepare('SELECT path, text, tag, done FROM tasks ORDER BY path').all()
  expect(tasks.length).toBeGreaterThanOrEqual(5)
  expect(tasks.some((task) => (task as { tag: string }).tag === 'учёба')).toBe(true)

  await unlink(join(root, 'Inbox', 'Idea.md'))
  expect(applyVaultChanges(db, 'v', await scanVault(root))).toBe(1)
  expect(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE path = 'Inbox/Idea.md'").get()).toEqual({ n: 0 })
})

test('counts repeated identical task lines separately', async () => {
  const db = openDb(':memory:')
  await writeFile(join(root, 'Inbox', 'Repeats.md'), '- [ ] #vitamins Zinc\n- [ ] #vitamins Zinc\n')
  applyVaultChanges(db, 'v', await scanVault(root))

  const row = db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE path = 'Inbox/Repeats.md' AND text LIKE '%Zinc%'")
    .get()
  expect(row).toEqual({ n: 2 })
})
