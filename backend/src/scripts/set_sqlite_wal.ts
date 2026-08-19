import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
console.log(`Setting WAL mode on SQLite DB: ${dbPath}`);

const db = new Database(dbPath);
const journalResult = db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 30000');
db.pragma('synchronous = NORMAL');
db.close();

console.log(`Journal Mode Result:`, journalResult);
console.log(`✅ SQLite WAL Mode and 30s Busy Timeout set successfully!`);
