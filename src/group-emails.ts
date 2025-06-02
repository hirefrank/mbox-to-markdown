// Email grouping script
// This script analyzes email subjects and groups them based on similarity

import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { parseArgs } from "https://deno.land/std@0.208.0/cli/parse_args.ts";

interface EmailMetadata {
  subject: string;
  from: string;
  to: string;
  date: string;
  filePath: string;
}

interface EmailGroup {
  name: string;
  count: number;
  emails: EmailMetadata[];
  keywords: string[];
}

// Parse command line arguments
const args = parseArgs(Deno.args, {
  string: ["dir", "output", "threshold", "chunkSize"],
  default: {
    dir: "./output/emails",
    output: "./output/email-groups.md",
    threshold: "0.7", // Similarity threshold (0.0 to 1.0)
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

// Function to normalize text for comparison
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

// Function to extract keywords from a subject
function extractKeywords(subject: string): string[] {
  const normalized = normalizeText(subject);
  // Remove common stopwords
  const stopwords = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", 
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being", 
    "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't", 
    "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", 
    "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", 
    "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", 
    "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", 
    "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", 
    "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", 
    "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", 
    "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", 
    "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", 
    "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", 
    "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", 
    "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", 
    "who", "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", 
    "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves", "re", "fw"
  ]);
  
  // Split into words and filter out stopwords and short words
  return normalized
    .split(' ')
    .filter(word => word.length > 2 && !stopwords.has(word));
}

// Calculate similarity between two subjects
function calculateSimilarity(subject1: string, subject2: string): number {
  const keywords1 = extractKeywords(subject1);
  const keywords2 = extractKeywords(subject2);
  
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  
  // Use Jaccard similarity coefficient
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  
  // Find intersection
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  
  // Find union
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Group emails by subject similarity
function groupEmails(emails: EmailMetadata[], threshold: number): EmailGroup[] {
  const groups: EmailGroup[] = [];
  const processedEmails = new Set<string>();
  
  for (const email of emails) {
    // Skip if this email has already been processed
    if (processedEmails.has(email.filePath)) continue;
    
    // Start a new group with this email
    const group: EmailGroup = {
      name: "",
      count: 1,
      emails: [email],
      keywords: extractKeywords(email.subject)
    };
    
    processedEmails.add(email.filePath);
    
    // Find similar emails
    for (const otherEmail of emails) {
      if (processedEmails.has(otherEmail.filePath)) continue;
      
      const similarity = calculateSimilarity(email.subject, otherEmail.subject);
      if (similarity >= threshold) {
        group.emails.push(otherEmail);
        group.count++;
        processedEmails.add(otherEmail.filePath);
        
        // Add new keywords
        const otherKeywords = extractKeywords(otherEmail.subject);
        for (const keyword of otherKeywords) {
          if (!group.keywords.includes(keyword)) {
            group.keywords.push(keyword);
          }
        }
      }
    }
    
    // Generate a name for the group based on common keywords
    if (group.keywords.length > 0) {
      group.name = group.keywords.slice(0, 3).join(" ");
    } else {
      group.name = `Group ${groups.length + 1}`;
    }
    
    groups.push(group);
  }
  
  // Sort groups by size (largest first)
  return groups.sort((a, b) => b.count - a.count);
}

// Generate markdown report
function generateMarkdownReport(groups: EmailGroup[], emailsDir: string): string {
  let markdown = "# Email Groups by Subject Similarity\n\n";
  
  markdown += `Total groups: ${groups.length}\n\n`;
  
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    markdown += `## Group ${i + 1}: ${group.name} (${group.count} emails)\n\n`;
    markdown += `Keywords: ${group.keywords.join(", ")}\n\n`;
    markdown += "| Subject | From | Date |\n";
    markdown += "|---------|------|------|\n";
    
    for (const email of group.emails) {
      // Use relative path for links
      const relativePath = email.filePath.replace(emailsDir + '/', '');
      markdown += `| [${email.subject}](${relativePath}) | ${email.from.split("<")[0].trim()} | ${email.date} |\n`;
    }
    
    markdown += "\n";
  }
  
  return markdown;
}

// Process emails in chunks to reduce memory usage
async function processEmailsInChunks(emailsDir: string, threshold: number, chunkSize = 500): Promise<EmailGroup[]> {
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
  const allGroups: EmailGroup[] = [];
  let processedCount = 0;
  
  // Process in chunks
  for (let i = 0; i < emailFiles.length; i += chunkSize) {
    const chunk = emailFiles.slice(i, i + chunkSize);
    const chunkEmails: EmailMetadata[] = [];
    
    console.log(`Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(emailFiles.length/chunkSize)}...`);
    
    // Process each file in the chunk
    for (const filePath of chunk) {
      const metadata = await extractMetadata(filePath);
      if (metadata && metadata.subject) {
        chunkEmails.push(metadata);
      }
    }
    
    processedCount += chunkEmails.length;
    console.log(`Processed ${processedCount}/${emailFiles.length} emails so far`);
    
    // Group this chunk
    if (chunkEmails.length > 0) {
      const chunkGroups = groupEmails(chunkEmails, threshold);
      
      // Merge with existing groups
      mergeGroups(allGroups, chunkGroups, threshold);
    }
    
    // Force garbage collection between chunks by clearing references
    // This is a trick to help with memory management
    chunk.length = 0;
  }
  
  return allGroups;
}

// Merge new groups into existing groups based on similarity
function mergeGroups(existingGroups: EmailGroup[], newGroups: EmailGroup[], threshold: number): void {
  for (const newGroup of newGroups) {
    let merged = false;
    
    // Try to find a similar existing group
    for (const existingGroup of existingGroups) {
      // Calculate similarity between group keywords
      const set1 = new Set(existingGroup.keywords);
      const set2 = new Set(newGroup.keywords);
      
      // Find intersection
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      
      // Find union
      const union = new Set([...set1, ...set2]);
      
      const similarity = intersection.size / union.size;
      
      if (similarity >= threshold) {
        // Merge the groups
        existingGroup.emails.push(...newGroup.emails);
        existingGroup.count += newGroup.count;
        
        // Add new keywords
        for (const keyword of newGroup.keywords) {
          if (!existingGroup.keywords.includes(keyword)) {
            existingGroup.keywords.push(keyword);
          }
        }
        
        merged = true;
        break;
      }
    }
    
    // If no similar group was found, add as a new group
    if (!merged) {
      existingGroups.push(newGroup);
    }
  }
}

// Main function
async function main() {
  const emailsDir = args.dir;
  const outputFile = args.output;
  const threshold = parseFloat(args.threshold);
  const chunkSize = parseInt(args.chunkSize || "500");
  
  console.log(`Reading email files from ${emailsDir}...`);
  
  // Process emails in chunks to reduce memory usage
  const groups = await processEmailsInChunks(emailsDir, threshold, chunkSize);
  
  console.log(`Created ${groups.length} groups`);
  
  // Sort groups by size (largest first)
  groups.sort((a, b) => b.count - a.count);
  
  // Generate and save report
  const report = generateMarkdownReport(groups, emailsDir);
  await Deno.writeTextFile(outputFile, report);
  
  console.log(`Report saved to ${outputFile}`);
}

// Run the main function
main().catch(error => {
  console.error("Error:", error);
  Deno.exit(1);
});
