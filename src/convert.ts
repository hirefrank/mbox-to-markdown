import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";
import { myEmails, myNames, ignoredSenders } from "./config.ts";

interface EmailData {
  subject: string;
  from: string;
  to: string;
  date: string;
  messageId: string;
  body: string;
  headers: Record<string, string>;
}

class MboxParser {
  private decoder = new TextDecoder();

  async parseFile(filePath: string): Promise<EmailData[]> {
    console.log(`Reading mbox file: ${filePath}`);

    const fileInfo = await Deno.stat(filePath);
    console.log(`File size: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);

    // Use a command-line approach to process the file
    // This is more efficient for very large files
    console.log("Processing emails using command-line tools...");

    // Create a temporary directory to store individual email files
    const tempDir = await Deno.makeTempDir({ prefix: "mbox_emails_" });
    console.log(`Created temporary directory: ${tempDir}`);

    try {
      // Use the 'csplit' command to split the mbox file into individual email files
      // This splits on lines starting with "From "
      const splitCommand = new Deno.Command("csplit", {
        args: [
          filePath,           // Input file
          "/^From /",         // Pattern to split on
          "{*}",              // Repeat for all occurrences
          "-f", `${tempDir}/email_`, // Output file prefix
          "-z"                // Use leading zeros
        ],
      });

      const splitResult = await splitCommand.output();
      if (!splitResult.success) {
        const errorOutput = new TextDecoder().decode(splitResult.stderr);
        throw new Error(`Failed to split mbox file: ${errorOutput}`);
      }

      // Get a list of all the email files
      const emailFiles = [];
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.isFile && entry.name.startsWith("email_")) {
          emailFiles.push(`${tempDir}/${entry.name}`);
        }
      }

      console.log(`Split mbox file into ${emailFiles.length} individual email files`);

      // Process each email file
      const emails: EmailData[] = [];
      let skippedSelfEmails = 0;

      for (let i = 0; i < emailFiles.length; i++) {
        const emailFile = emailFiles[i];

        // Read the email content
        const content = await Deno.readTextFile(emailFile);

        // Parse the email
        const email = this.parseEmail(content);

        if (email) {
          if (this.isSelfEmail(email)) {
            skippedSelfEmails++;
          } else {
            emails.push(email);
          }
        }

        // Report progress every 1000 emails
        if ((i + 1) % 1000 === 0 || i === emailFiles.length - 1) {
          console.log(`Processed ${i + 1}/${emailFiles.length} emails, found ${emails.length} non-self emails`);
        }

        // Clean up the email file
        await Deno.remove(emailFile);
      }

      console.log(`Total emails processed: ${emailFiles.length}`);
      console.log(`Skipped ${skippedSelfEmails} self-emails`);
      console.log(`Found ${emails.length} non-self emails`);

      return emails;

    } catch (error) {
      console.error('Error processing mbox file:', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      // Clean up the temporary directory
      try {
        await Deno.remove(tempDir, { recursive: true });
        console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary directory:',
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      }
    }
  }

  // This method is kept for backward compatibility but is no longer used directly
  private parseContent(content: string): EmailData[] {
    const emails: EmailData[] = [];
    let skippedSelfEmails = 0;

    // Split on "From " at the beginning of lines (mbox format delimiter)
    const emailBlocks = content.split(/\n(?=From )/);

    console.log(`Found ${emailBlocks.length} email blocks`);

    for (let i = 0; i < emailBlocks.length; i++) {
      if (i % 100 === 0) {
        console.log(`Processing email ${i + 1}/${emailBlocks.length}`);
      }

      const block = emailBlocks[i].trim();
      if (block) {
        const email = this.parseEmail(block);
        if (email) {
          if (this.isSelfEmail(email)) {
            skippedSelfEmails++;
          } else {
            emails.push(email);
          }
        }
      }
    }

    console.log(`Skipped ${skippedSelfEmails} self-emails`);
    return emails;
  }

  private isSelfEmail(email: EmailData): boolean {
    // Using imported configuration from config.ts

    // Extract email addresses and names from From and To fields
    const fromEmail = this.extractEmail(email.from);
    const fromName = this.extractName(email.from);
    const toEmails = this.extractEmails(email.to);
    const toNames = this.extractNames(email.to);

    // Check if the sender should be ignored
    if (ignoredSenders.some(sender =>
        email.from.toLowerCase().includes(sender.toLowerCase()) ||
        (fromName && fromName.toLowerCase().includes(sender.toLowerCase()))
    )) {
      return true; // Ignore this email
    }

    // Add some debugging for the first few emails to understand the filtering
    if (Math.random() < 0.01) { // Only log about 1% of emails to avoid excessive output
      console.log('\nEmail Debug:');
      console.log(`From: ${email.from}`);
      console.log(`To: ${email.to}`);
      console.log(`Extracted from email: ${fromEmail}`);
      console.log(`Extracted from name: ${fromName}`);
      console.log(`Extracted to emails: ${toEmails.join(', ')}`);
      console.log(`Extracted to names: ${toNames.join(', ')}`);
    }

    // Check if FROM is one of my addresses/names
    const isFromMe = myEmails.some(addr =>
      fromEmail?.toLowerCase().includes(addr.toLowerCase())
    ) || myNames.some(name =>
      fromName?.toLowerCase().includes(name.toLowerCase())
    );

    // Check if TO contains one of my addresses/names
    const isToMe = toEmails.some(addr =>
      myEmails.some(myAddr => addr.toLowerCase().includes(myAddr.toLowerCase()))
    ) || toNames.some(name =>
      myNames.some(myName => name.toLowerCase().includes(myName.toLowerCase()))
    );

    // Consider an email as a self-email if it's from me to myself
    // or if it's from an ignored sender
    return isFromMe && isToMe;
  }

  private extractEmail(field: string): string | null {
    // Extract email from formats like "Name <email@domain.com>" or just "email@domain.com"
    const emailMatch = field.match(/<([^>]+)>/) || field.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return emailMatch ? emailMatch[1] : null;
  }

  private extractName(field: string): string | null {
    // Extract name from formats like "Name <email>" or just "Name"
    const nameMatch = field.match(/^([^<]+)</);
    if (nameMatch) {
      return nameMatch[1].trim().replace(/['"]/g, '');
    }
    // If no angle brackets, check if it looks like just a name (no @ symbol)
    if (!field.includes('@')) {
      return field.trim().replace(/['"]/g, '');
    }
    return null;
  }

  private extractEmails(field: string): string[] {
    // Handle multiple recipients separated by commas
    const recipients = field.split(',');
    return recipients
      .map(recipient => this.extractEmail(recipient.trim()))
      .filter(email => email !== null) as string[];
  }

  private extractNames(field: string): string[] {
    // Handle multiple recipients separated by commas
    const recipients = field.split(',');
    return recipients
      .map(recipient => this.extractName(recipient.trim()))
      .filter(name => name !== null) as string[];
  }

  private parseEmail(block: string): EmailData | null {
    try {
      // Skip the first line if it starts with "From " (mbox separator)
      let startIndex = 0;
      const lines = block.split('\n');
      if (lines[0] && lines[0].startsWith('From ')) {
        startIndex = lines[0].length + 1; // +1 for the newline
      }

      // Get the content after the separator
      const content = block.substring(startIndex);

      // Try different approaches to find the header/body separation
      let headerSection = '';
      let body = '';

      // Approach 1: Standard double newline
      const doubleNewlineIndex = content.indexOf('\n\n');
      if (doubleNewlineIndex !== -1) {
        headerSection = content.substring(0, doubleNewlineIndex);
        body = this.cleanBody(content.substring(doubleNewlineIndex + 2));
      }
      // Approach 2: Look for common header patterns and assume everything after is body
      else {
        // Split into lines for analysis
        const contentLines = content.split('\n');
        let headerEndLine = -1;

        // Find the last line that looks like a header
        // Headers typically have a colon and don't start with whitespace
        for (let i = 0; i < contentLines.length; i++) {
          const line = contentLines[i];
          // Skip continuation lines (start with whitespace)
          if (line.startsWith(' ') || line.startsWith('\t')) {
            continue;
          }

          // If this line has a colon and isn't too long, it's probably a header
          if (line.includes(':') && line.length < 200) {
            headerEndLine = i;
          } else if (line.trim() === '') {
            // Empty line could be a separator
            headerEndLine = i;
            break;
          } else if (i > 0 && !line.includes(':')) {
            // If we've seen at least one line and this one doesn't have a colon,
            // it's probably the start of the body
            headerEndLine = i - 1;
            break;
          }
        }

        // If we found a potential header end
        if (headerEndLine >= 0) {
          headerSection = contentLines.slice(0, headerEndLine + 1).join('\n');
          body = this.cleanBody(contentLines.slice(headerEndLine + 1).join('\n'));
        } else {
          // Last resort: treat the first line as header and the rest as body
          headerSection = contentLines[0] || '';
          body = this.cleanBody(contentLines.slice(1).join('\n'));
        }
      }

      // If we couldn't extract a reasonable header section, log and return null
      if (!headerSection) {
        if (Math.random() < 0.01) {
          console.log('\nEmail parsing failed - Could not extract headers:');
          console.log(`First few lines: ${content.substring(0, 200)}...`);
        }
        return null;
      }

      // Parse headers
      const headers = this.parseHeaders(headerSection);

      // Extract key headers
      const subject = headers['Subject'] || headers['subject'] || '(No Subject)';
      const from = headers['From'] || headers['from'] || '(No Sender)';
      const to = headers['To'] || headers['to'] || '(No Recipient)';
      const date = headers['Date'] || headers['date'] || '';
      const messageId = headers['Message-ID'] || headers['Message-Id'] || headers['message-id'] || '';

      // Skip emails without basic required fields
      if (from === '(No Sender)' || to === '(No Recipient)') {
        if (Math.random() < 0.01) {
          console.log('\nSkipping email with missing required fields:');
          console.log(`From: ${from}`);
          console.log(`To: ${to}`);
        }
        return null;
      }

      // Debug successful parsing occasionally
      if (Math.random() < 0.01) {
        console.log('\nSuccessfully parsed email:');
        console.log(`Subject: ${subject}`);
        console.log(`From: ${from}`);
        console.log(`To: ${to}`);
        console.log(`Date: ${date}`);
        console.log(`Message-ID: ${messageId}`);
        console.log(`Body length: ${body.length} characters`);
      }

      return {
        subject,
        from,
        to,
        date,
        messageId,
        body,
        headers
      };
    } catch (err) {
      console.error('Error parsing email:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private parseHeaders(headerSection: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = headerSection.split('\n');

    let currentHeader = '';
    let currentValue = '';

    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation of previous header
        currentValue += ' ' + line.trim();
      } else {
        // Save previous header if exists
        if (currentHeader) {
          headers[currentHeader] = this.decodeHeader(currentValue);
        }

        // Start new header
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          currentHeader = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        }
      }
    }

    // Don't forget the last header
    if (currentHeader) {
      headers[currentHeader] = this.decodeHeader(currentValue);
    }

    return headers;
  }

  private decodeHeader(value: string): string {
    // Basic handling of encoded headers (RFC 2047)
    // This is a simplified version - you might want to use a proper library for complex cases
    return value
      .replace(/=\?[^?]+\?[BQ]\?([^?]+)\?=/gi, (match, encoded) => {
        try {
          // This is a very basic decoder - consider using a proper RFC 2047 decoder for production
          return atob(encoded);
        } catch {
          return match;
        }
      })
      .trim();
  }

  private cleanBody(body: string): string {
    // Remove quoted-printable encoding artifacts and clean up
    return body
      .replace(/=\r?\n/g, '') // Remove quoted-printable line breaks
      .replace(/=([0-9A-F]{2})/g, (_match, hex) => {
        // Convert hex codes back to characters
        return String.fromCharCode(parseInt(hex, 16));
      })
      .trim();
  }
}

class MarkdownGenerator {
  async saveEmailsAsMarkdown(emails: EmailData[], outputDir: string): Promise<void> {
    await ensureDir(outputDir);

    console.log(`Saving ${emails.length} emails to ${outputDir}`);

    for (let i = 0; i < emails.length; i++) {
      if (i % 50 === 0) {
        console.log(`Saving email ${i + 1}/${emails.length}`);
      }

      const email = emails[i];
      const filename = this.generateFilename(email, i);
      const markdown = this.emailToMarkdown(email);

      const filePath = `${outputDir}/${filename}`;
      await Deno.writeTextFile(filePath, markdown);
    }

    // Create an index file
    await this.createIndexFile(emails, outputDir);
  }

  private generateFilename(email: EmailData, index: number): string {
    // Create a safe filename from subject and date
    const date = this.parseDate(email.date);
    const subject = email.subject
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .substring(0, 50); // Limit length

    const dateStr = date ? date.toISOString().split('T')[0] : 'unknown-date';
    return `${String(index + 1).padStart(4, '0')}-${dateStr}-${subject || 'no-subject'}.md`;
  }

  parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    try {
      // Try standard date parsing first
      const date = new Date(dateStr);

      // Check if the date is valid
      if (!isNaN(date.getTime())) {
        return date;
      }

      // Try different common email date formats
      // Example: "Mon, 12 Jan 2023 15:30:45 +0000 (UTC)"
      const cleanDateStr = dateStr
        .replace(/\(.*?\)/g, '') // Remove parentheses and their contents
        .trim();

      const altDate = new Date(cleanDateStr);
      if (!isNaN(altDate.getTime())) {
        return altDate;
      }

      return null;
    } catch {
      return null;
    }
  }

  private emailToMarkdown(email: EmailData): string {
    const date = this.parseDate(email.date);
    const formattedDate = date ? date.toLocaleString() : email.date;

    return `# ${email.subject}

## Email Metadata

- **From:** ${email.from}
- **To:** ${email.to}
- **Date:** ${formattedDate}
- **Message ID:** ${email.messageId}

## Email Body

${email.body}

---

### Raw Headers
\`\`\`
${Object.entries(email.headers)
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n')}
\`\`\`
`;
  }

  private async createIndexFile(emails: EmailData[], outputDir: string): Promise<void> {
    const indexContent = `# Email Archive Index

Total emails: ${emails.length}

## Emails by Date

${emails
  .map((email, index) => {
    const date = this.parseDate(email.date);
    const formattedDate = date ? date.toISOString().split('T')[0] : 'unknown-date';
    const filename = this.generateFilename(email, index);
    return `- [${formattedDate}] [${email.subject}](./${filename}) - From: ${email.from}`;
  })
  .join('\n')}
`;

    await Deno.writeTextFile(`${outputDir}/INDEX.md`, indexContent);
    console.log('Created INDEX.md with email listings');
  }
}

// Main execution
async function main() {
  const args = parseArgs(Deno.args, {
    string: ['input', 'output', 'since-date', 'until-date'],
    alias: {
      i: 'input',
      o: 'output',
      d: 'since-date',
      u: 'until-date',
      h: 'help'
    }
  });

  if (args.help || !args.input) {
    console.log(`
Usage: deno run --allow-read --allow-write mbox-to-markdown.ts -i <mbox-file> -o <output-dir> [options]

Options:
  -i, --input       Path to the mbox file
  -o, --output      Output directory for markdown files (default: ./output/emails)
  -d, --since-date  Only include emails on or after this date (YYYY-MM-DD format)
  -u, --until-date  Only include emails before this date (YYYY-MM-DD format)
  -h, --help        Show this help message

Examples:
  deno run --allow-read --allow-write mbox-to-markdown.ts -i ./my-emails.mbox -o ./email-markdown
  deno run --allow-read --allow-write mbox-to-markdown.ts -i ./my-emails.mbox --since-date 2023-01-01
  deno run --allow-read --allow-write mbox-to-markdown.ts -i ./my-emails.mbox --until-date 2023-12-31
  deno run --allow-read --allow-write mbox-to-markdown.ts -i ./my-emails.mbox --since-date 2023-01-01 --until-date 2023-12-31
`);
Deno.exit(0);
}

const inputFile = args.input;
const outputDir = args.output || "./output/emails";
const sinceDateStr = args["since-date"];
const untilDateStr = args["until-date"];

try {
  // Check if input file exists
  const fileInfo = await Deno.stat(inputFile);
  console.log(`Input file size: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);

  const parser = new MboxParser();
  let emails = await parser.parseFile(inputFile);
  
  const generator = new MarkdownGenerator();
  let originalCount = emails.length;
  
  // Filter emails by date if a since-date is provided
  if (sinceDateStr) {
    try {
      const sinceDate = new Date(sinceDateStr);
      
      if (isNaN(sinceDate.getTime())) {
        throw new Error(`Invalid date format: ${sinceDateStr}. Please use YYYY-MM-DD format.`);
      }
      
      console.log(`Filtering emails on or after ${sinceDateStr}`);
      
      emails = emails.filter(email => {
        const emailDate = generator.parseDate(email.date);
        return emailDate && emailDate >= sinceDate;
      });
      
      console.log(`Filtered from ${originalCount} to ${emails.length} emails`);
      originalCount = emails.length; // Update count for potential until-date filter
    } catch (error) {
      console.error(`Error parsing date filter: ${error instanceof Error ? error.message : String(error)}`);
      Deno.exit(1);
    }
  }
  
  // Filter emails by date if an until-date is provided
  if (untilDateStr) {
    try {
      const untilDate = new Date(untilDateStr);
      
      if (isNaN(untilDate.getTime())) {
        throw new Error(`Invalid date format: ${untilDateStr}. Please use YYYY-MM-DD format.`);
      }
      
      console.log(`Filtering emails before ${untilDateStr}`);
      
      emails = emails.filter(email => {
        const emailDate = generator.parseDate(email.date);
        return emailDate && emailDate < untilDate;
      });
      
      console.log(`Filtered from ${originalCount} to ${emails.length} emails`);
    } catch (error) {
      console.error(`Error parsing date filter: ${error instanceof Error ? error.message : String(error)}`);
      Deno.exit(1);
    }
  }

    console.log(`Successfully parsed ${emails.length} emails`);

    await generator.saveEmailsAsMarkdown(emails, outputDir);

    console.log(`✅ Done! Saved ${emails.length} emails as markdown files in ${outputDir}`);
    console.log(`📋 Check ${outputDir}/INDEX.md for a complete listing`);

  } catch (error: unknown) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}