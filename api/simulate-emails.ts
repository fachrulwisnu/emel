import { getAutoTags } from '../src/tags';
import { syncAndAnalyzeEmail } from '../src/database-service';

export default async function handler(req: any, res: any) {
  try {
    const branches = ["TEGAL", "YOGYAKARTA", "SOLO", "SEMARANG", "BANDUNG", "SURABAYA", "CILACAP", "CIREBON"];
    const docTypes = ["UAT", "FSD", "SIT"];
    const appNames = ["Procurement App", "Delivery Tracking", "Payment Gateway Integration", "Inventory Management", "HR Payroll Sync"];
    const senders = [
      { name: "Dewi Lestari", email: "dewi.l@advantagescm.com" },
      { name: "Budi Setiawan", email: "budi.s@advantagescm.com" },
      { name: "Siti Rahma", email: "siti.r@advantagescm.com" },
      { name: "NOC Automated Agent", email: "agent-noc@advantagescm.com" },
      { name: "Fachrul Wisnu", email: "fachrul.wisnu@advantagescm.com" }
    ];

    const simulatedCount = Math.floor(Math.random() * 2) + 2; // Generate 2 or 3 emails
    const fetchedEmails = [];

    for (let i = 0; i < simulatedCount; i++) {
      const isSpeedtest = Math.random() > 0.5;
      const uid = `sim_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const date = new Date(Date.now() - i * 12 * 60 * 1000).toISOString();

      if (isSpeedtest) {
        const branch = branches[Math.floor(Math.random() * branches.length)];
        const dl = (Math.random() * 85 + 15).toFixed(1);
        const ul = (Math.random() * 75 + 10).toFixed(1);
        const ping = Math.floor(Math.random() * 45) + 4;
        const status = ping > 30 ? "WARNING" : "EXCELLENT";

        const subject = `SPEEDTEST RUTIN CABANG ${branch}`;
        const body = `Hi Team,\n\nHere is the speedtest routine report for CABANG ${branch}:\n- Download: ${dl} Mbps\n- Upload: ${ul} Mbps\n- Latency: ${ping}ms\n- Status: ${status}\n\nGenerated automatically by SLA Monitor.`;
        const bodyHtml = `<p>Hi Team,</p><p>Here is the speedtest routine report for <strong>CABANG ${branch}</strong>:</p><ul><li>Download: <strong>${dl} Mbps</strong></li><li>Upload: <strong>${ul} Mbps</strong></li><li>Latency: <strong>${ping}ms</strong></li><li>Status: <span style="color: ${status === "WARNING" ? "#f59e0b" : "#10b981"};"><strong>${status}</strong></span></li></ul><p>Generated automatically by SLA Monitor.</p>`;

        const tags = getAutoTags(subject, body);
        fetchedEmails.push({
          uid,
          subject,
          fromName: "Network Operation Center",
          fromAddress: "noc@advantagescm.com",
          date,
          body,
          bodyHtml,
          tags
        });
      } else {
        const sender = senders[Math.floor(Math.random() * senders.length)];
        const docType = docTypes[Math.floor(Math.random() * docTypes.length)];
        const appName = appNames[Math.floor(Math.random() * appNames.length)];

        const subject = `Approval requested: ${docType} Signoff for ${appName}`;
        const body = `Dear Team,\n\nI have finalized and uploaded the ${docType} documents for ${appName}.\n\nPlease review the test cases and grant your Approval so we can transition to the next phase.\n\nBest regards,\n${sender.name}`;
        const bodyHtml = `<p>Dear Team,</p><p>I have finalized and uploaded the <strong>${docType}</strong> documents for <strong>${appName}</strong>.</p><p>Please review the test cases and grant your <strong>Approval</strong> so we can transition to the next phase.</p><p>Best regards,<br/><strong>${sender.name}</strong></p>`;

        const tags = getAutoTags(subject, body);
        fetchedEmails.push({
          uid,
          subject,
          fromName: sender.name,
          fromAddress: sender.email,
          date,
          body,
          bodyHtml,
          tags
        });
      }
    }

    // Save to Database
    for (const email of fetchedEmails) {
      await syncAndAnalyzeEmail({
        message_id: email.uid,
        subject: email.subject,
        sender: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
        receiver: "fachrul.wisnu@advantagescm.com",
        date: email.date,
        body_text: email.body,
        html_body: email.bodyHtml,
        tags: email.tags,
        is_read: false
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully simulated and saved ${simulatedCount} new emails to SQLite!`,
      fetchedCount: simulatedCount
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || String(err) });
  }
}
