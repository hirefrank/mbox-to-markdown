// Email grouping by sender script
// This script analyzes emails and groups them by sender, with chunked processing for memory efficiency

import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";

interface EmailMetadata {
  subject: string;
  from: string;
  to: string;
  date: string;
  filePath: string;
}

interface SenderGroup {
  sender: string;
  count: number;
  emails: EmailMetadata[];
}

// Parse command line arguments
const args = parseArgs(Deno.args, {
  string: ["dir", "output", "chunkSize"],
  default: {
    dir: "./output/emails",
    output: "./output/sender-groups.md",
    chunkSize: "500"  // Number of emails to process at once
  }
});

// Function to extract metadata from markdown files
async function extractMetadata(filePath: string): Promise<EmailMetadata | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    
    // Extract the subject from the first line (# Subject)
    const subjectMatch = content.match(/^# (.+)/);
    const subject = subjectMatch ? subjectMatch[1] : "";
    
    // Extract metadata from the bullet points
    const fromMatch = content.match(/\*\*From:\*\* (.+)/);
    const toMatch = content.match(/\*\*To:\*\* (.+)/);
    const dateMatch = content.match(/\*\*Date:\*\* (.+)/);
    
    if (!subject || !fromMatch || !toMatch) {
      return null;
    }
    
    return {
      subject,
      from: fromMatch[1],
      to: toMatch[1],
      date: dateMatch ? dateMatch[1] : "",
      filePath
    };
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// Extract the sender name from the full "From" field
function extractSenderName(from: string): string {
  // Try to extract name from format "Name <email@example.com>"
  const nameMatch = from.match(/^([^<]+)(?:<.+>)?/);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  return from.trim();
}

// Group emails by sender
function groupEmailsBySender(emails: EmailMetadata[]): SenderGroup[] {
  const senderMap = new Map<string, SenderGroup>();
  
  for (const email of emails) {
    const senderName = extractSenderName(email.from);
    
    if (!senderMap.has(senderName)) {
      senderMap.set(senderName, {
        sender: senderName,
        count: 0,
        emails: []
      });
    }
    
    const group = senderMap.get(senderName)!;
    group.count++;
    group.emails.push(email);
  }
  
  // Convert map to array and sort by count (descending)
  return Array.from(senderMap.values())
    .sort((a, b) => b.count - a.count);
}

// Process emails in chunks to reduce memory usage
async function processEmailsInChunks(emailsDir: string, chunkSize = 500): Promise<SenderGroup[]> {
  console.log(`Processing emails in chunks of ${chunkSize}...`);
  
  // Get all email files first
  const emailFiles: string[] = [];
  for await (const entry of walk(emailsDir, { exts: [".md"], skip: [/^INDEX\.md$/] })) {
    if (entry.isFile) {
      emailFiles.push(entry.path);
    }
  }
  
  console.log(`Found ${emailFiles.length} email files`);
  
  // Process emails in chunks
  const allSenderGroups = new Map<string, SenderGroup>();
  let processedCount = 0;
  
  for (let i = 0; i < emailFiles.length; i += chunkSize) {
    const chunk = emailFiles.slice(i, i + chunkSize);
    const chunkEmails: EmailMetadata[] = [];
    
    // Process each file in the chunk
    for (const filePath of chunk) {
      const metadata = await extractMetadata(filePath);
      if (metadata) {
        chunkEmails.push(metadata);
      }
    }
    
    processedCount += chunkEmails.length;
    console.log(`Processed ${processedCount}/${emailFiles.length} emails so far`);
    
    // Group this chunk by sender
    if (chunkEmails.length > 0) {
      const chunkGroups = groupEmailsBySender(chunkEmails);
      
      // Merge with existing groups
      for (const group of chunkGroups) {
        if (allSenderGroups.has(group.sender)) {
          const existingGroup = allSenderGroups.get(group.sender)!;
          existingGroup.count += group.count;
          existingGroup.emails.push(...group.emails);
        } else {
          allSenderGroups.set(group.sender, group);
        }
      }
    }
    
    // Force garbage collection between chunks by clearing references
    chunk.length = 0;
  }
  
  // Convert map to array and sort by count (descending)
  return Array.from(allSenderGroups.values())
    .sort((a, b) => b.count - a.count);
}

// Generate markdown report
function generateMarkdownReport(groups: SenderGroup[], emailsDir: string): string {
  let markdown = "# Email Groups by Sender\n\n";
  
  markdown += `Total unique senders: ${groups.length}\n\n`;
  markdown += "| Sender | Email Count |\n";
  markdown += "|--------|------------|\n";
  
  for (const group of groups) {
    markdown += `| ${group.sender} | ${group.count} |\n`;
  }
  
  markdown += "\n\n## Detailed Breakdown\n\n";
  
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    markdown += `### ${i + 1}. ${group.sender} (${group.count} emails)\n\n`;
    markdown += "| Subject | Date |\n";
    markdown += "|---------|------|\n";
    
    // Sort emails by date (newest first)
    const sortedEmails = [...group.emails].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Show only the first 10 emails if there are many
    const displayEmails = sortedEmails.length > 10 ? sortedEmails.slice(0, 10) : sortedEmails;
    
    for (const email of displayEmails) {
      // Use relative path for links
      const relativePath = email.filePath.replace(emailsDir + '/', '');
      markdown += `| [${email.subject}](${relativePath}) | ${email.date} |\n`;
    }
    
    if (sortedEmails.length > 10) {
      markdown += `| ... and ${sortedEmails.length - 10} more emails | |\n`;
    }
    
    markdown += "\n";
  }
  
  return markdown;
}

// Main function
async function main() {
  const emailsDir = args.dir;
  const outputFile = args.output;
  const chunkSize = parseInt(args.chunkSize || "500");
  
  console.log(`Reading email files from ${emailsDir}...`);
  
  // Process emails in chunks to reduce memory usage
  const senderGroups = await processEmailsInChunks(emailsDir, chunkSize);
  
  console.log(`Found ${senderGroups.length} unique senders`);
  
  // Generate and save report
  const report = generateMarkdownReport(senderGroups, emailsDir);
  await Deno.writeTextFile(outputFile, report);
  
  console.log(`Report saved to ${outputFile}`);
}

// Run the main function
main().catch(error => {
  console.error("Error:", error);
  Deno.exit(1);
});
