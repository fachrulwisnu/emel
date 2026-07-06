import fs from 'fs/promises';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'emails_db.json');

export interface EmailRecord {
  id?: number;
  uid: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  date: string;
  body: string;
  bodyHtml: string;
  tags: string[];
}

// In-memory cache for fast read and single source of truth
let cache: EmailRecord[] = [];

/**
 * Loads database from the JSON file. Creates file with empty array if not exists.
 */
async function loadDb(): Promise<void> {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    cache = JSON.parse(data);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // Create empty db file
      cache = [];
      await saveDb();
    } else {
      console.error('Error reading JSON database:', err);
      cache = [];
    }
  }
}

/**
 * Saves cache back to the JSON file.
 */
async function saveDb(): Promise<void> {
  try {
    await fs.writeFile(dbPath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing JSON database:', err);
  }
}

/**
 * Initializes the database and seeds it if it is empty.
 */
export async function initDb(): Promise<void> {
  await loadDb();
  await seedDbIfEmpty();
}

/**
 * Saves a parsed email record into the database, ignoring if already saved.
 */
export async function saveEmail(email: EmailRecord): Promise<void> {
  // Reload database in case of updates from multiple processes
  await loadDb();
  
  const exists = cache.some(item => item.uid === email.uid);
  if (!exists) {
    // Generate a numeric id
    const nextId = cache.length > 0 ? Math.max(...cache.map(item => item.id || 0)) + 1 : 1;
    const newRecord = { ...email, id: nextId };
    cache.push(newRecord);
    await saveDb();
  }
}

/**
 * Retrieves all emails from the database, ordered by ID descending.
 */
export async function getAllEmails(): Promise<EmailRecord[]> {
  await loadDb();
  // Sort by id descending
  return [...cache].sort((a, b) => (b.id || 0) - (a.id || 0));
}

/**
 * Retrieves all stored UIDs from the database to identify which ones already exist.
 */
export async function getEmailUids(): Promise<string[]> {
  await loadDb();
  return cache.map(item => item.uid);
}

/**
 * Deletes all emails in the database.
 */
export async function clearAllEmails(): Promise<void> {
  cache = [];
  await saveDb();
}

/**
 * Seeds the database with default email records if it is empty.
 */
async function seedDbIfEmpty(): Promise<void> {
  if (cache.length > 0) {
    console.log(`Database already has ${cache.length} email records. Skipping seeding.`);
    return;
  }

  console.log('Seeding JSON database with default ticketing emails...');
  
  const seedEmails: EmailRecord[] = [
    {
      uid: 'seed_msg_1',
      subject: 'SPEEDTEST RUTIN CABANG PURWOKERTO',
      fromName: 'Network Operation Center',
      fromAddress: 'noc@advantagescm.com',
      date: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
      body: `Hi Team,\n\nHere is the speedtest routine report for CABANG PURWOKERTO:\n- Download: 94.5 Mbps\n- Upload: 88.2 Mbps\n- Latency: 12ms\n- Status: EXCELLENT\n\nBest regards,\nNOC Team`,
      bodyHtml: `<p>Hi Team,</p><p>Here is the speedtest routine report for <strong>CABANG PURWOKERTO</strong>:</p><ul><li>Download: <strong>94.5 Mbps</strong></li><li>Upload: <strong>88.2 Mbps</strong></li><li>Latency: <strong>12ms</strong></li><li>Status: <span style="color: green;"><strong>EXCELLENT</strong></span></li></ul><p>Best regards,<br/>NOC Team</p>`,
      tags: ['Speedtest', 'Purwokerto']
    },
    {
      uid: 'seed_msg_2',
      subject: 'SPEEDTEST RUTIN CABANG SENEN',
      fromName: 'NOC Automated Agent',
      fromAddress: 'agent-senen@advantagescm.com',
      date: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
      body: `SPEEDTEST RUTIN - CABANG SENEN:\n\nTesting complete.\nSpeed: 42.1 Mbps down / 15.3 Mbps up\nPing: 35ms\nNote: Upload is slightly below SLA but acceptable.\n\nGenerated automatically.`,
      bodyHtml: `<h3>SPEEDTEST RUTIN - CABANG SENEN:</h3><p>Testing complete.</p><p>Speed: <strong>42.1 Mbps down</strong> / <strong>15.3 Mbps up</strong><br/>Ping: <strong>35ms</strong></p><p><em>Note: Upload is slightly below SLA but acceptable.</em></p><p>Generated automatically.</p>`,
      tags: ['Speedtest', 'Senen']
    },
    {
      uid: 'seed_msg_3',
      subject: 'Approval Request: Procurement App UAT Document',
      fromName: 'Fachrul Wisnu',
      fromAddress: 'fachrul.wisnu@advantagescm.com',
      date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      body: `Dear Managers,\n\nThe User Acceptance Testing (UAT) results for the new Procurement Application are ready.\nWe have completed all test cases successfully.\n\nPlease review and grant your Approval.\n\nRegards,\nFachrul Wisnu\nLead Developer`,
      bodyHtml: `<p>Dear Managers,</p><p>The <strong>User Acceptance Testing (UAT)</strong> results for the new Procurement Application are ready.</p><p>We have completed all test cases successfully with a 100% pass rate.</p><p>Please review the attached log and grant your <strong>Approval</strong>.</p><p>Regards,<br/><strong>Fachrul Wisnu</strong><br/>Lead Developer</p>`,
      tags: ['Approval', 'UAT']
    },
    {
      uid: 'seed_msg_4',
      subject: 'URGENT: Approval needed for Delivery System FSD v1.2',
      fromName: 'Rian Wijaya',
      fromAddress: 'rian.w@advantagescm.com',
      date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      body: `Hi Fachrul,\n\nI need your Approval on the updated Functional Specification Document (FSD) v1.2 for the Delivery tracking system.\nWe must hand this over to the SIT team by tomorrow.\n\nThank you,\nRian`,
      bodyHtml: `<p>Hi Fachrul,</p><p>I need your <strong>Approval</strong> on the updated Functional Specification Document (<strong>FSD</strong>) v1.2 for the Delivery tracking system.</p><p>We must hand this over to the SIT team by tomorrow morning.</p><p>Thank you,<br/>Rian</p>`,
      tags: ['Approval', 'FSD']
    },
    {
      uid: 'seed_msg_5',
      subject: 'Approval requested: SIT Test Results for Payment Gateway Integration',
      fromName: 'Mega Sari',
      fromAddress: 'mega.s@advantagescm.com',
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      body: `Dear Team,\n\nThe System Integration Testing (SIT) for our Payment Gateway has passed. All payment channels (VA, CC, QRIS) are functional.\nWe seek formal Approval to move this to UAT.\n\nAttachment: SIT_Report_SignOff.xlsx\n\nThanks,\nMega`,
      bodyHtml: `<p>Dear Team,</p><p>The <strong>System Integration Testing (SIT)</strong> for our Payment Gateway has passed. All payment channels (VA, CC, QRIS) are functional.</p><p>We seek formal <strong>Approval</strong> to move this to UAT.</p><p>Attachment: <em>SIT_Report_SignOff.xlsx</em></p><p>Thanks,<br/>Mega</p>`,
      tags: ['Approval', 'SIT']
    },
    {
      uid: 'seed_msg_6',
      subject: 'Server Maintenance Window Announcement',
      fromName: 'IT Infrastructure',
      fromAddress: 'infra@advantagescm.com',
      date: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
      body: `Hello All,\n\nPlease be advised that our primary mail server mail.advantagescm.com will undergo routine security patching on Saturday at 11 PM.\nExpect brief downtime of around 15 minutes.\n\nIT Infra Helpdesk`,
      bodyHtml: `<p>Hello All,</p><p>Please be advised that our primary mail server <strong>mail.advantagescm.com</strong> will undergo routine security patching on Saturday at 11 PM.</p><p>Expect brief downtime of around 15 minutes.</p><p>IT Infra Helpdesk</p>`,
      tags: []
    }
  ];

  try {
    for (const email of seedEmails) {
      const nextId = cache.length > 0 ? Math.max(...cache.map(item => item.id || 0)) + 1 : 1;
      cache.push({ ...email, id: nextId });
    }
    await saveDb();
    console.log(`Seeded ${seedEmails.length} default emails successfully.`);
  } catch (err3) {
    console.error('Error saving seeded emails:', err3);
  }
}
