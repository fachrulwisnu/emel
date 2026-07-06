/**
 * Extracts the branch name from a Subject that contains "SPEEDTEST RUTIN".
 * E.g., from "CABANG PURWOKERTO" it extracts "PURWOKERTO".
 */
export function extractBranchName(subject: string): string {
  // Match "CABANG <Name>"
  const cabangMatch = subject.match(/CABANG\s+([A-Za-z0-9_\-]+)/i);
  if (cabangMatch && cabangMatch[1]) {
    return cabangMatch[1].trim().toUpperCase();
  }

  // Fallback: look for other identifiers after "SPEEDTEST RUTIN"
  const idx = subject.toUpperCase().indexOf("SPEEDTEST RUTIN");
  if (idx !== -1) {
    const after = subject.substring(idx + "SPEEDTEST RUTIN".length).trim();
    // Clean up leading characters
    const cleaned = after.replace(/^[\s\-\:\(]+/, '').trim();
    if (cleaned) {
      const parts = cleaned.split(/[\s\-]+/);
      if (parts[0]) {
        return parts[0].replace(/[\)\s]+/g, '').trim().toUpperCase();
      }
    }
  }

  return "GENERAL";
}

/**
 * Applies the business rules to automatically assign tags to an email.
 * - Rule 1 (Speedtest): If Subject has "SPEEDTEST RUTIN", extract Branch Name. Tags: [Speedtest, <Branch Name>]
 * - Rule 2 (Approval): If Subject has "Approval", detect "UAT", "FSD", or "SIT" in body/subject. Tags: [Approval, <Doc Type>]
 */
export function getAutoTags(subject: string, body: string): string[] {
  const tags: string[] = [];
  const subjUpper = (subject || "").toUpperCase();
  const bodyUpper = (body || "").toUpperCase();

  // Rule 1: Speedtest Routine
  if (subjUpper.includes("SPEEDTEST")) {
    tags.push("Speedtest");
    const branch = extractBranchName(subject);
    if (branch && branch !== "GENERAL") {
      // Format as Capitalized (e.g., PURWOKERTO -> Purwokerto)
      const formattedBranch = branch.charAt(0).toUpperCase() + branch.slice(1).toLowerCase();
      tags.push(formattedBranch);
    } else {
      tags.push("General");
    }
  }

  // Rule 2: Approval
  if (subjUpper.includes("APPROVAL")) {
    tags.push("Approval");
    let docTypeAdded = false;

    // Detect UAT, FSD, SIT with word boundaries to be precise
    if (/\bUAT\b/i.test(subject) || /\bUAT\b/i.test(body)) {
      tags.push("UAT");
      docTypeAdded = true;
    }
    if (/\bFSD\b/i.test(subject) || /\bFSD\b/i.test(body)) {
      tags.push("FSD");
      docTypeAdded = true;
    }
    if (/\bSIT\b/i.test(subject) || /\bSIT\b/i.test(body)) {
      tags.push("SIT");
      docTypeAdded = true;
    }

    if (!docTypeAdded) {
      tags.push("Other");
    }
  }

  return tags;
}
