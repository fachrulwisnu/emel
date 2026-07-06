import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { getSeedEmails } from './seed';

const DB_FILE_PATH = path.join(process.cwd(), 'emails.db');

export interface DbEmail {
  id?: number;
  message_id: string;
  subject: string;
  sender: string;
  receiver: string;
  date: string;
  body_text: string;
  html_body: string;
  tags: string; // stored as JSON string
}

let dbInstance: sqlite3.Database | null = null;

export function getDbConnection(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }
    const db = new sqlite3.Database(DB_FILE_PATH, (err) => {
      if (err) {
        console.error('Failed to connect to SQLite database:', err);
        return reject(err);
      }
      dbInstance = db;
      resolve(db);
    });
  });
}

/**
 * Initializes the SQLite database and creates the emails table if it doesn't exist.
 * If the table is empty, seeds it with mock emails.
 */
export async function initDb(): Promise<void> {
  const db = await getDbConnection();
  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      // Create table
      db.run(`
        CREATE TABLE IF NOT EXISTS emails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT UNIQUE,
          subject TEXT,
          sender TEXT,
          receiver TEXT,
          date TEXT,
          body_text TEXT,
          html_body TEXT,
          tags TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          return reject(err);
        }
      });

      // Check if empty
      db.get('SELECT COUNT(*) as count FROM emails', (err, row: any) => {
        if (err) {
          console.error('Error checking row count:', err);
          return reject(err);
        }

        if (row && row.count === 0) {
          console.log('[SQLite DB] Database is empty. Seeding initial data...');
          const seedEmails = getSeedEmails();
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const email of seedEmails) {
            const senderStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
            const receiverStr = 'fachrul.wisnu@advantagescm.com'; // default mock receiver
            const tagsJson = JSON.stringify(email.tags || []);
            stmt.run(
              email.uid,
              email.subject,
              senderStr,
              receiverStr,
              email.date,
              email.body,
              email.bodyHtml,
              tagsJson
            );
          }
          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              console.error('Error finalizing seed statement:', finalizeErr);
              return reject(finalizeErr);
            }
            console.log('[SQLite DB] Seeding completed.');
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Retrieves all emails from the database, sorted by date descending (newest first).
 */
export async function getAllEmails(): Promise<any[]> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM emails ORDER BY date DESC', (err, rows) => {
      if (err) {
        return reject(err);
      }
      
      // Map to frontend expectation
      const mapped = (rows || []).map((row: any) => {
        let parsedTags: string[] = [];
        try {
          parsedTags = JSON.parse(row.tags || '[]');
        } catch {
          parsedTags = row.tags ? row.tags.split(',') : [];
        }

        // Parse sender string "Name <address>" or just "address"
        let fromName = '';
        let fromAddress = row.sender || '';
        if (row.sender && row.sender.includes('<')) {
          const match = row.sender.match(/^(.*?)\s*<(.*?)>/);
          if (match) {
            fromName = match[1].trim();
            fromAddress = match[2].trim();
          }
        }

        return {
          id: row.id,
          uid: row.message_id,
          subject: row.subject,
          fromName: fromName || fromAddress,
          fromAddress,
          receiver: row.receiver || '',
          date: row.date,
          body: row.body_text,
          bodyHtml: row.html_body,
          tags: parsedTags
        };
      });

      resolve(mapped);
    });
  });
}

/**
 * Upserts an email into the database.
 * Uses message_id as key for conflict.
 */
export async function upsertEmail(email: {
  message_id: string;
  subject: string;
  sender: string;
  receiver: string;
  date: string;
  body_text: string;
  html_body: string;
  tags: string[];
}): Promise<void> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        receiver = excluded.receiver,
        date = excluded.date,
        body_text = excluded.body_text,
        html_body = excluded.html_body,
        tags = excluded.tags
      `,
      [
        email.message_id,
        email.subject,
        email.sender,
        email.receiver,
        email.date,
        email.body_text,
        email.html_body,
        JSON.stringify(email.tags || [])
      ],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * Clears all records from the emails table.
 */
export async function clearDb(): Promise<void> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM emails', (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}
