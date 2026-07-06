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
  category?: string;
  sub_category?: string;
}

let dbInstance: sqlite3.Database | null = null;

export function classifyEmail(subject: string): { category: string; subCategory: string } {
  const subjUpper = (subject || '').toUpperCase();
  
  if (subjUpper.includes('SPEEDTEST RUTIN')) {
    // Extract everything after SPEEDTEST RUTIN
    const match = subject.match(/SPEEDTEST RUTIN\s+(.*)/i);
    const sub = match ? match[1].trim() : 'General';
    return {
      category: 'Speedtest Routine',
      subCategory: sub || 'General'
    };
  }
  
  if (subjUpper.includes('TUGAS SHIFT MALAM')) {
    // Extract period/date or everything after "Tugas Shift Malam"
    const match = subject.match(/Tugas Shift Malam\s*[-–:]?\s*(.*)/i);
    const sub = match ? match[1].trim() : 'General';
    return {
      category: 'Tugas Shift Malam',
      subCategory: sub || 'General'
    };
  }
  
  // Default fallback
  const cleanSubj = subject || '';
  const sub = cleanSubj.length > 30 ? cleanSubj.substring(0, 30) + '...' : cleanSubj;
  return {
    category: 'Uncategorized',
    subCategory: sub || '(No Subject)'
  };
}

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
          tags TEXT,
          category TEXT,
          sub_category TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          return reject(err);
        }
      });

      // Migration: Ensure category and sub_category columns exist in case table existed earlier
      db.run('ALTER TABLE emails ADD COLUMN category TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN sub_category TEXT', () => {});

      // Migration: Backfill categories for existing entries
      db.all('SELECT id, subject FROM emails WHERE category IS NULL OR category = ""', (err, rows: any[]) => {
        if (!err && rows && rows.length > 0) {
          console.log(`[SQLite DB] Migrating ${rows.length} existing emails to new categories...`);
          const stmt = db.prepare('UPDATE emails SET category = ?, sub_category = ? WHERE id = ?');
          for (const row of rows) {
            const { category, subCategory } = classifyEmail(row.subject || '');
            stmt.run(category, subCategory, row.id);
          }
          stmt.finalize();
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
            INSERT OR IGNORE INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags, category, sub_category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const email of seedEmails) {
            const senderStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
            const receiverStr = 'fachrul.wisnu@advantagescm.com'; // default mock receiver
            const tagsJson = JSON.stringify(email.tags || []);
            const { category, subCategory } = classifyEmail(email.subject || '');
            stmt.run(
              email.uid,
              email.subject,
              senderStr,
              receiverStr,
              email.date,
              email.body,
              email.bodyHtml,
              tagsJson,
              category,
              subCategory
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

        const { category, subCategory } = classifyEmail(row.subject || '');
        const emailCategory = row.category || category;
        const emailSubCategory = row.sub_category || subCategory;

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
          tags: parsedTags,
          category: emailCategory,
          subCategory: emailSubCategory
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
  category?: string;
  sub_category?: string;
}): Promise<void> {
  const db = await getDbConnection();
  
  // Classify dynamically if not provided
  let emailCategory = email.category;
  let emailSubCategory = email.sub_category;
  if (!emailCategory || !emailSubCategory) {
    const classification = classifyEmail(email.subject);
    if (!emailCategory) emailCategory = classification.category;
    if (!emailSubCategory) emailSubCategory = classification.subCategory;
  }

  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags, category, sub_category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        receiver = excluded.receiver,
        date = excluded.date,
        body_text = excluded.body_text,
        html_body = excluded.html_body,
        tags = excluded.tags,
        category = excluded.category,
        sub_category = excluded.sub_category
      `,
      [
        email.message_id,
        email.subject,
        email.sender,
        email.receiver,
        email.date,
        email.body_text,
        email.html_body,
        JSON.stringify(email.tags || []),
        emailCategory,
        emailSubCategory
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
 * Aggregates all categories and sub-categories with counts.
 */
export async function getDynamicFolders(): Promise<{ category: string; subCategory: string; count: number }[]> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT category, sub_category as subCategory, COUNT(*) as count 
       FROM emails 
       GROUP BY category, sub_category 
       ORDER BY category ASC, sub_category ASC`,
      (err, rows: any[]) => {
        if (err) {
          return reject(err);
        }
        resolve(rows || []);
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
