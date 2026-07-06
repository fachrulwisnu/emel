export interface SeedEmail {
  id: number;
  uid: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  date: string;
  body: string;
  bodyHtml: string;
  tags: string[];
}

export const getSeedEmails = (): SeedEmail[] => {
  const now = new Date();
  return [
    {
      id: 1,
      uid: 'seed_msg_1',
      subject: 'SPEEDTEST RUTIN CABANG PURWOKERTO',
      fromName: 'Network Operation Center',
      fromAddress: 'noc@advantagescm.com',
      date: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), // 5 mins ago
      body: `Hi Team,\n\nHere is the speedtest routine report for CABANG PURWOKERTO:\n- Download: 94.5 Mbps\n- Upload: 88.2 Mbps\n- Latency: 12ms\n- Status: EXCELLENT\n\nBest regards,\nNOC Team`,
      bodyHtml: `<p>Hi Team,</p><p>Here is the speedtest routine report for <strong>CABANG PURWOKERTO</strong>:</p><ul><li>Download: <strong>94.5 Mbps</strong></li><li>Upload: <strong>88.2 Mbps</strong></li><li>Latency: <strong>12ms</strong></li><li>Status: <span style="color: green;"><strong>EXCELLENT</strong></span></li></ul><p>Best regards,<br/>NOC Team</p>`,
      tags: ['Speedtest', 'Purwokerto']
    },
    {
      id: 2,
      uid: 'seed_msg_2',
      subject: 'SPEEDTEST RUTIN CABANG SENEN',
      fromName: 'NOC Automated Agent',
      fromAddress: 'agent-senen@advantagescm.com',
      date: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 mins ago
      body: `SPEEDTEST RUTIN - CABANG SENEN:\n\nTesting complete.\nSpeed: 42.1 Mbps down / 15.3 Mbps up\nPing: 35ms\nNote: Upload is slightly below SLA but acceptable.\n\nGenerated automatically.`,
      bodyHtml: `<h3>SPEEDTEST RUTIN - CABANG SENEN:</h3><p>Testing complete.</p><p>Speed: <strong>42.1 Mbps down</strong> / <strong>15.3 Mbps up</strong><br/>Ping: <strong>35ms</strong></p><p><em>Note: Upload is slightly below SLA but acceptable.</em></p><p>Generated automatically.</p>`,
      tags: ['Speedtest', 'Senen']
    },
    {
      id: 3,
      uid: 'seed_msg_3',
      subject: 'Approval Request: Procurement App UAT Document',
      fromName: 'Fachrul Wisnu',
      fromAddress: 'fachrul.wisnu@advantagescm.com',
      date: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      body: `Dear Managers,\n\nThe User Acceptance Testing (UAT) results for the new Procurement Application are ready.\nWe have completed all test cases successfully.\n\nPlease review and grant your Approval.\n\nRegards,\nFachrul Wisnu\nLead Developer`,
      bodyHtml: `<p>Dear Managers,</p><p>The <strong>User Acceptance Testing (UAT)</strong> results for the new Procurement Application are ready.</p><p>We have completed all test cases successfully with a 100% pass rate.</p><p>Please review the attached log and grant your <strong>Approval</strong>.</p><p>Regards,<br/><strong>Fachrul Wisnu</strong><br/>Lead Developer</p>`,
      tags: ['Approval', 'UAT']
    },
    {
      id: 4,
      uid: 'seed_msg_4',
      subject: 'URGENT: Approval needed for Delivery System FSD v1.2',
      fromName: 'Rian Wijaya',
      fromAddress: 'rian.w@advantagescm.com',
      date: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      body: `Hi Fachrul,\n\nI need your Approval on the updated Functional Specification Document (FSD) v1.2 for the Delivery tracking system.\nWe must hand this over to the SIT team by tomorrow.\n\nThank you,\nRian`,
      bodyHtml: `<p>Hi Fachrul,</p><p>I need your <strong>Approval</strong> on the updated Functional Specification Document (<strong>FSD</strong>) v1.2 for the Delivery tracking system.</p><p>We must hand this over to the SIT team by tomorrow morning.</p><p>Thank you,<br/>Rian</p>`,
      tags: ['Approval', 'FSD']
    },
    {
      id: 5,
      uid: 'seed_msg_5',
      subject: 'Approval requested: SIT Test Results for Payment Gateway Integration',
      fromName: 'Mega Sari',
      fromAddress: 'mega.s@advantagescm.com',
      date: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      body: `Dear Team,\n\nThe System Integration Testing (SIT) for our Payment Gateway has passed. All payment channels (VA, CC, QRIS) are functional.\nWe seek formal Approval to move this to UAT.\n\nAttachment: SIT_Report_SignOff.xlsx\n\nThanks,\nMega`,
      bodyHtml: `<p>Dear Team,</p><p>The <strong>System Integration Testing (SIT)</strong> for our Payment Gateway has passed. All payment channels (VA, CC, QRIS) are functional.</p><p>We seek formal <strong>Approval</strong> to move this to UAT.</p><p>Attachment: <em>SIT_Report_SignOff.xlsx</em></p><p>Thanks,<br/>Mega</p>`,
      tags: ['Approval', 'SIT']
    },
    {
      id: 6,
      uid: 'seed_msg_6',
      subject: 'Server Maintenance Window Announcement',
      fromName: 'IT Infrastructure',
      fromAddress: 'infra@advantagescm.com',
      date: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
      body: `Hello All,\n\nPlease be advised that our primary mail server mail.advantagescm.com will undergo routine security patching on Saturday at 11 PM.\nExpect brief downtime of around 15 minutes.\n\nIT Infra Helpdesk`,
      bodyHtml: `<p>Hello All,</p><p>Please be advised that our primary mail server <strong>mail.advantagescm.com</strong> will undergo routine security patching on Saturday at 11 PM.</p><p>Expect brief downtime of around 15 minutes.</p><p>IT Infra Helpdesk</p>`,
      tags: []
    }
  ];
};
