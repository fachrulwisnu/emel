import axios from 'axios';
import { getAppSettings } from './database-service';

export interface ExtractedOrder {
  amount: number;
  currencyCode: string;
  branchName: string;
}

/**
 * Parses the plain text email body to extract Bank Order variables.
 * Format examples:
 *   Amount: 250,000,000
 *   Currency: IDR
 *   Branch Name: Purwokerto
 */
export function parseBankOrderEmail(bodyText: string): ExtractedOrder {
  const cleanBody = bodyText || '';

  // 1. Parse Amount
  let amount = 0;
  // Match "Amount: 150,000,000" or "Amount = 150000" or just "Amount 500k"
  const amountMatch = cleanBody.match(/(?:Amount|Nilai)\s*[:=]\s*([\d,.]+)/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // 2. Parse Currency Code
  let currencyCode = 'IDR';
  const currencyMatch = cleanBody.match(/(?:Currency|Mata\s+Uang|Currency\s+Code)\s*[:=]\s*([a-zA-Z]{3})/i);
  if (currencyMatch) {
    currencyCode = currencyMatch[1].toUpperCase().trim();
  }

  // 3. Parse Branch Name
  let branchName = 'Purwokerto';
  const branchMatch = cleanBody.match(/(?:Branch|Cabang|Bank\s+Branch\s+Name|Branch\s+Name)\s*[:=]\s*([a-zA-Z0-9\s\-]+)/i);
  if (branchMatch) {
    branchName = branchMatch[1].trim();
  }

  return { amount, currencyCode, branchName };
}

/**
 * Triggers the sequential CIT API Order Creation Flow
 * 1. GET CIT-read_currencies & CIT-read_entity_master_details
 * 2. POST CIT-create_delivery
 * 3. POST CIT-create_delivery_detail
 */
export async function triggerCitApiWorkflow(emailId: string, subject: string, bodyText: string): Promise<{
  success: boolean;
  log: string;
  data?: any;
}> {
  const settings = getAppSettings();
  const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';

  const { amount, currencyCode, branchName } = parseBankOrderEmail(bodyText);

  let workflowLog = `[CIT API Workflow Triggered for Email ID: ${emailId}]\n`;
  workflowLog += `Parsed Variables: Amount = ${amount}, Currency = ${currencyCode}, Branch = ${branchName}\n`;

  const headers = {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json'
  };

  try {
    // Step 1a: GET currencies
    workflowLog += `[Step 1a] Fetching currencies from Active ATM API...\n`;
    let currencyId = 1; // Default fallback ID
    try {
      const currenciesRes = await axios.get('https://api-activeatm.adv.my.id/api/v1/CIT/read_currencies', { headers, timeout: 8000 });
      workflowLog += `[Step 1a Success] Currencies count: ${currenciesRes.data?.data?.length || 0}\n`;
      
      const foundCurrency = currenciesRes.data?.data?.find((c: any) => 
        String(c.code || c.currency_code || c.name).toLowerCase() === currencyCode.toLowerCase()
      );
      if (foundCurrency) {
        currencyId = foundCurrency.id;
        workflowLog += `Mapped currency "${currencyCode}" to System ID: ${currencyId}\n`;
      } else {
        workflowLog += `Currency "${currencyCode}" not found in list. Using default ID: ${currencyId}\n`;
      }
    } catch (currErr: any) {
      workflowLog += `[Step 1a Warning] Failed to fetch currencies list: ${currErr.message}. Using default ID: ${currencyId}\n`;
    }

    // Step 1b: GET branch entities
    workflowLog += `[Step 1b] Fetching entity master details (branches) from Active ATM API...\n`;
    let branchId = 5; // Default fallback ID (e.g., Purwokerto/General)
    try {
      const branchRes = await axios.get('https://api-activeatm.adv.my.id/api/v1/CIT/read_entity_master_details', { headers, timeout: 8000 });
      workflowLog += `[Step 1b Success] Branches count: ${branchRes.data?.data?.length || 0}\n`;

      const foundBranch = branchRes.data?.data?.find((b: any) => 
        String(b.name || b.branch_name).toLowerCase().includes(branchName.toLowerCase())
      );
      if (foundBranch) {
        branchId = foundBranch.id;
        workflowLog += `Mapped branch "${branchName}" to System ID: ${branchId}\n`;
      } else {
        workflowLog += `Branch "${branchName}" not found in list. Using default ID: ${branchId}\n`;
      }
    } catch (branchErr: any) {
      workflowLog += `[Step 1b Warning] Failed to fetch branches list: ${branchErr.message}. Using default ID: ${branchId}\n`;
    }

    // Step 2: POST CIT-create_delivery
    workflowLog += `[Step 2] Posting to CIT-create_delivery (Create Order Header)...\n`;
    const deliveryPayload = {
      currency_id: currencyId,
      branch_id: branchId,
      amount: amount,
      order_date: new Date().toISOString().split('T')[0],
      source_reference: emailId,
      ticket_subject: subject
    };

    let deliveryId = 101; // default fallback delivery ID
    try {
      const deliveryRes = await axios.post(
        'https://api-activeatm.adv.my.id/api/v1/CIT/create_delivery',
        deliveryPayload,
        { headers, timeout: 10000 }
      );
      deliveryId = deliveryRes.data?.id || deliveryRes.data?.data?.id || deliveryId;
      workflowLog += `[Step 2 Success] Main Delivery Order created successfully with ID: ${deliveryId}\n`;
    } catch (delivErr: any) {
      workflowLog += `[Step 2 Error] Main delivery order POST failed: ${delivErr.message}\n`;
      throw delivErr;
    }

    // Step 3: POST CIT-create_delivery_detail
    workflowLog += `[Step 3] Posting to CIT-create_delivery_detail (Insert Items/Details)...\n`;
    const detailPayload = {
      delivery_id: deliveryId,
      currency_id: currencyId,
      amount: amount,
      item_name: 'Cash Box / Bank Bag',
      quantity: 1
    };

    try {
      const detailRes = await axios.post(
        'https://api-activeatm.adv.my.id/api/v1/CIT/create_delivery_detail',
        detailPayload,
        { headers, timeout: 10000 }
      );
      workflowLog += `[Step 3 Success] Delivery details inserted successfully!\n`;
    } catch (detailErr: any) {
      workflowLog += `[Step 3 Error] Delivery detail insertion POST failed: ${detailErr.message}\n`;
      throw detailErr;
    }

    workflowLog += `\n[CIT Workflow COMPLETED SUCCESSFULLY!]\n`;
    return {
      success: true,
      log: workflowLog,
      data: { deliveryId, amount, currencyCode, branchName }
    };

  } catch (err: any) {
    workflowLog += `\n[CIT Workflow FAILED]: ${err.message || String(err)}\n`;
    if (err.response) {
      workflowLog += `API Response Data: ${JSON.stringify(err.response.data)}\n`;
      workflowLog += `API Response Status: ${err.response.status}\n`;
    }
    return {
      success: false,
      log: workflowLog
    };
  }
}
