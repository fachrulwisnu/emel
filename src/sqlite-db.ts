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

export function classifyFolder(sender: string, subject: string): { folder_parent: string; folder_child: string } {
  const subj = subject || '';
  const subjUpper = subj.toUpperCase();

  // RULE 1 (SPEEDTEST)
  if (subjUpper.includes('SPEEDTEST')) {
    let child = 'General';
    // Try to match anything after "cabang" or "rutin"
    const cabangMatch = subj.match(/(?:cabang|rutin)\s+([a-zA-Z0-9\s\-]+)/i);
    if (cabangMatch && cabangMatch[1].trim()) {
      child = cabangMatch[1].trim();
    } else {
      const stMatch = subj.match(/speedtest\s+([a-zA-Z0-9\s\-]+)/i);
      if (stMatch && stMatch[1].trim()) {
        child = stMatch[1].trim();
      }
    }
    
    // Capitalize first letters of each word of child and trim
    child = child.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').trim();

    return {
      folder_parent: 'Speedtest',
      folder_child: child || 'General'
    };
  }

  // RULE 2 (APPROVAL / DOKUMEN)
  if (subjUpper.includes('FSD') || subjUpper.includes('SIT') || subjUpper.includes('UAT') || subjUpper.includes('APPROVAL')) {
    let child = 'General Approval';
    if (subjUpper.includes('FSD')) {
      child = 'FSD';
    } else if (subjUpper.includes('UAT')) {
      child = 'UAT';
    } else if (subjUpper.includes('SIT')) {
      child = 'SIT';
    }
    return {
      folder_parent: 'Approval',
      folder_child: child
    };
  }

  // RULE 3 (MEETING)
  if (subjUpper.includes('MEETING') || subjUpper.includes('MOM') || subjUpper.includes('INVITATION')) {
    let child = 'General Meeting';
    if (subjUpper.includes('MOM')) {
      child = 'MoM';
    } else if (subjUpper.includes('INVITATION') || subjUpper.includes('INVITE')) {
      child = 'Invitation';
    }
    return {
      folder_parent: 'Meeting',
      folder_child: child
    };
  }

  // RULE 4 (DEFAULT / OTHERS)
  return {
    folder_parent: 'Lainnya',
    folder_child: 'Uncategorized'
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
          sub_category TEXT,
          folder_parent TEXT,
          folder_child TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          return reject(err);
        }
      });

      // Create custom_filters table
      db.run(`
        CREATE TABLE IF NOT EXISTS custom_filters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          match_from TEXT,
          match_subject TEXT,
          match_body TEXT,
          action_parent TEXT,
          action_child TEXT
        )
      `, (err) => {
        if (err) {
          console.error('Error creating custom_filters table:', err);
        }
      });

      // Migration: Ensure category, sub_category, folder_parent, and folder_child columns exist
      db.run('ALTER TABLE emails ADD COLUMN category TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN sub_category TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN folder_parent TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN folder_child TEXT', () => {});
      db.run('ALTER TABLE emails ADD COLUMN attachments TEXT', () => {});

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

      // Migration: Backfill folder_parent and folder_child for all entries using new Subject-based rules
      db.all('SELECT id, sender, subject FROM emails', (err, rows: any[]) => {
        if (!err && rows && rows.length > 0) {
          console.log(`[SQLite DB] Migrating ${rows.length} existing emails to new Subject-based folders tree...`);
          const stmt = db.prepare('UPDATE emails SET folder_parent = ?, folder_child = ? WHERE id = ?');
          for (const row of rows) {
            const { folder_parent, folder_child } = classifyFolder(row.sender || '', row.subject || '');
            stmt.run(folder_parent, folder_child, row.id);
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
            INSERT OR IGNORE INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags, category, sub_category, folder_parent, folder_child)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const email of seedEmails) {
            const senderStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
            const receiverStr = 'fachrul.wisnu@advantagescm.com'; // default mock receiver
            const tagsJson = JSON.stringify(email.tags || []);
            const { category, subCategory } = classifyEmail(email.subject || '');
            const { folder_parent, folder_child } = classifyFolder(senderStr, email.subject || '');
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
              subCategory,
              folder_parent,
              folder_child
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

        const { folder_parent, folder_child } = classifyFolder(row.sender || '', row.subject || '');
        const emailFolderParent = row.folder_parent || folder_parent;
        const emailFolderChild = row.folder_child || folder_child;

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
          subCategory: emailSubCategory,
          folderParent: emailFolderParent,
          folderChild: emailFolderChild
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
  folder_parent?: string;
  folder_child?: string;
  attachments?: any[];
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

  let folderParent = email.folder_parent;
  let folderChild = email.folder_child;

  if (!folderParent || !folderChild) {
    try {
      const filters: any[] = await new Promise((resolveFilters) => {
        db.all('SELECT * FROM custom_filters', (err, rows) => {
          if (err) resolveFilters([]);
          else resolveFilters(rows || []);
        });
      });

      for (const filter of filters) {
        // Skip filter if all criteria are empty to prevent false positives matching everything
        if (!filter.match_from && !filter.match_subject && !filter.match_body) {
          continue;
        }

        let isMatch = true;
        const emailObj = {
          from: email.sender || '',
          subject: email.subject || '',
          text: email.body_text || ''
        };

        if (filter.match_from && !emailObj.from.toLowerCase().includes(filter.match_from.toLowerCase())) isMatch = false;
        if (filter.match_subject && !emailObj.subject.toLowerCase().includes(filter.match_subject.toLowerCase())) isMatch = false;
        if (filter.match_body && !emailObj.text.toLowerCase().includes(filter.match_body.toLowerCase())) isMatch = false;

        if (isMatch) {
          folderParent = filter.action_parent;
          folderChild = filter.action_child;
          break;
        }
      }
    } catch (filterErr) {
      console.error('Error applying custom filters:', filterErr);
    }
  }

  if (!folderParent || !folderChild) {
    const classification = classifyFolder(email.sender, email.subject);
    if (!folderParent) folderParent = classification.folder_parent;
    if (!folderChild) folderChild = classification.folder_child;
  }

  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO emails (message_id, subject, sender, receiver, date, body_text, html_body, tags, category, sub_category, folder_parent, folder_child, attachments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        receiver = excluded.receiver,
        date = excluded.date,
        body_text = excluded.body_text,
        html_body = excluded.html_body,
        tags = excluded.tags,
        category = excluded.category,
        sub_category = excluded.sub_category,
        folder_parent = excluded.folder_parent,
        folder_child = excluded.folder_child,
        attachments = excluded.attachments
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
        emailSubCategory,
        folderParent,
        folderChild,
        JSON.stringify(email.attachments || [])
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
 * Aggregates all folder_parent and folder_child with counts.
 */
export async function getDynamicFolders(): Promise<{ folder_parent: string; folder_child: string; count: number }[]> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT folder_parent, folder_child, COUNT(*) as count 
       FROM emails 
       GROUP BY folder_parent, folder_child 
       ORDER BY folder_parent ASC, folder_child ASC`,
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

export interface CustomFilter {
  id?: number;
  name: string;
  match_from: string;
  match_subject: string;
  match_body: string;
  action_parent: string;
  action_child: string;
}

export async function getCustomFilters(): Promise<CustomFilter[]> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM custom_filters ORDER BY id ASC', (err, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export async function saveCustomFilter(filter: CustomFilter): Promise<void> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    if (filter.id) {
      db.run(
        `UPDATE custom_filters SET 
          name = ?, match_from = ?, match_subject = ?, match_body = ?, action_parent = ?, action_child = ?
         WHERE id = ?`,
        [filter.name, filter.match_from, filter.match_subject, filter.match_body, filter.action_parent, filter.action_child, filter.id],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    } else {
      db.run(
        `INSERT INTO custom_filters (name, match_from, match_subject, match_body, action_parent, action_child)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [filter.name, filter.match_from, filter.match_subject, filter.match_body, filter.action_parent, filter.action_child],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    }
  });
}

export async function deleteCustomFilter(id: number): Promise<void> {
  const db = await getDbConnection();
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM custom_filters WHERE id = ?', [id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
