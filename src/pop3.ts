import tls from 'tls';
import net from 'net';
import PostalMime from 'postal-mime';
import { getAutoTags } from './tags';

export class Pop3Client {
  private socket: tls.TLSSocket | net.Socket | null = null;
  private responseBuffer = '';
  private currentResolver: ((res: string) => void) | null = null;
  private currentRejecter: ((err: Error) => void) | null = null;
  private isMultiLine = false;

  /**
   * Connects to the POP3 server and waits for the greeting (+OK).
   */
  connect(host: string, port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.responseBuffer = '';
      this.isMultiLine = false;
      this.currentResolver = null;
      this.currentRejecter = null;

      // Port 995 is standard POP3 SSL/TLS. Other ports like 110 are usually plain TCP.
      const isSsl = port === 995;

      try {
        if (isSsl) {
          const options = {
            host,
            port,
            rejectUnauthorized: false // bypass SSL verification issues
          };
          this.socket = tls.connect(options, () => {
            // TLS Socket opened!
          });
        } else {
          this.socket = net.connect({ host, port }, () => {
            // Plain TCP Socket opened!
          });
        }

        let greetingReceived = false;

        const onData = (data: Buffer) => {
          this.responseBuffer += data.toString('utf8');
          
          if (!greetingReceived) {
            const idx = this.responseBuffer.indexOf('\r\n');
            if (idx !== -1) {
              const line = this.responseBuffer.substring(0, idx);
              this.responseBuffer = this.responseBuffer.substring(idx + 2);
              greetingReceived = true;
              
              if (line.startsWith('+OK')) {
                resolve(line.trim());
              } else {
                this.close();
                reject(new Error(`Server greeting error: ${line.trim()}`));
              }
            }
          } else {
            this.handleIncomingData();
          }
        };

        const onError = (err: Error) => {
          this.close();
          if (!greetingReceived) {
            reject(err);
          } else if (this.currentRejecter) {
            const rejectFn = this.currentRejecter;
            this.currentResolver = null;
            this.currentRejecter = null;
            rejectFn(err);
          }
        };

        this.socket.on('data', onData);
        this.socket.on('error', onError);
        this.socket.on('close', () => {
          this.close();
          if (this.currentRejecter) {
            const rejectFn = this.currentRejecter;
            this.currentResolver = null;
            this.currentRejecter = null;
            rejectFn(new Error('Connection closed by server'));
          }
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private handleIncomingData() {
    if (!this.currentResolver) return;

    if (this.isMultiLine) {
      // Look for standard POP3 end of message marker \r\n.\r\n
      const termIdx = this.responseBuffer.indexOf('\r\n.\r\n');
      if (termIdx !== -1) {
        const fullResponse = this.responseBuffer.substring(0, termIdx + 6);
        this.responseBuffer = this.responseBuffer.substring(termIdx + 6);
        
        const resolve = this.currentResolver;
        this.currentResolver = null;
        this.currentRejecter = null;
        resolve(fullResponse);
      } else if (this.responseBuffer.endsWith('\n.\r\n')) {
        const termIdx2 = this.responseBuffer.indexOf('\n.\r\n');
        const fullResponse = this.responseBuffer.substring(0, termIdx2 + 5);
        this.responseBuffer = this.responseBuffer.substring(termIdx2 + 5);
        
        const resolve = this.currentResolver;
        this.currentResolver = null;
        this.currentRejecter = null;
        resolve(fullResponse);
      }
    } else {
      // Look for simple newline termination
      const termIdx = this.responseBuffer.indexOf('\r\n');
      if (termIdx !== -1) {
        const fullResponse = this.responseBuffer.substring(0, termIdx + 2);
        this.responseBuffer = this.responseBuffer.substring(termIdx + 2);
        
        const resolve = this.currentResolver;
        this.currentResolver = null;
        this.currentRejecter = null;
        resolve(fullResponse);
      }
    }
  }

  /**
   * Sends a POP3 command and returns the promise that resolves with the response.
   */
  sendCommand(command: string, isMultiLine = false): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Not connected to POP3 server'));
      }
      this.currentResolver = resolve;
      this.currentRejecter = reject;
      this.isMultiLine = isMultiLine;
      
      this.socket.write(command + '\r\n');
      this.handleIncomingData(); // check if response is already in buffer
    });
  }

  close() {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (e) {}
      this.socket = null;
    }
  }
}

/**
 * Parses raw POP3 multi-line response, un-stuffing dots.
 */
export function parsePop3Message(rawResponse: string): string {
  const lines = rawResponse.split(/\r?\n/);
  
  // Remove status line (+OK)
  if (lines.length > 0 && lines[0].startsWith('+OK')) {
    lines.shift();
  }
  
  // Remove last line if it's the dot marker
  if (lines.length > 0 && lines[lines.length - 1] === '.') {
    lines.pop();
  } else if (lines.length > 0 && lines[lines.length - 1] === '') {
    // If empty trailing line, remove it and check the second to last
    lines.pop();
    if (lines.length > 0 && lines[lines.length - 1] === '.') {
      lines.pop();
    }
  }

  // Un-stuff dots (if double dots are at the beginning, replace with single dot)
  const unstuffedLines = lines.map(line => {
    if (line.startsWith('..')) {
      return line.substring(1);
    }
    return line;
  });

  return unstuffedLines.join('\r\n');
}

/**
 * Tests connection and authentication to POP3 server.
 */
export async function testConnection(host: string, port: number, user: string, pass: string): Promise<string> {
  const client = new Pop3Client();
  console.log(`\n=== [POP3 TEST CONNECTION START] ===`);
  console.log(`Target POP3 Server : ${host}:${port}`);
  console.log(`Username           : "${user}"`);
  console.log(`Password length    : ${pass ? pass.length : 0} characters`);

  try {
    console.log(`[POP3 Test Step 1/4] Establishing secure TLS socket connection...`);
    const greeting = await client.connect(host, port);
    console.log(`[POP3 Test Step 1/4] Success! Server Greeting: "${greeting.trim()}"`);
    
    console.log(`[POP3 Test Step 2/4] Sending USER command...`);
    const userRes = await client.sendCommand(`USER ${user}`);
    console.log(`[POP3 Test Step 2/4] Response to USER command: "${userRes.trim()}"`);
    if (!userRes.startsWith('+OK')) {
      console.warn(`[POP3 Test] USER command rejected by the server!`);
      throw new Error(`USER command rejected by server: ${userRes.trim()}`);
    }

    console.log(`[POP3 Test Step 3/4] Sending PASS command...`);
    const passRes = await client.sendCommand(`PASS ${pass}`);
    // Print response safely but masked
    console.log(`[POP3 Test Step 3/4] Response to PASS command: "${passRes.trim()}"`);
    if (!passRes.startsWith('+OK')) {
      console.warn(`[POP3 Test] PASS command rejected by the server (Authentication failed)!`);
      throw new Error(`Authentication failed (incorrect password or username): ${passRes.trim()}`);
    }

    console.log(`[POP3 Test Step 4/4] Connection verified! Sending QUIT command to close session...`);
    const quitRes = await client.sendCommand('QUIT');
    console.log(`[POP3 Test Step 4/4] Response to QUIT command: "${quitRes.trim()}"`);
    
    console.log(`=== [POP3 TEST CONNECTION SUCCESSFUL] ===\n`);
    return 'SUCCESS: Connected and authenticated successfully!';
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.error(`!!! [POP3 TEST CONNECTION FAILED] !!!`);
    console.error(`Error details:`, errorMsg);
    console.error(`======================================\n`);
    return `FAILED: ${errorMsg}`;
  } finally {
    client.close();
  }
}
