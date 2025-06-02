import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";
import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

// Configuration
const SOURCE_DIR = "./output/emails";
const TARGET_DIR = "./llm_ready";
const TARGET_FILE_COUNT = 300; // Target number of files for NotebookLM
const METADATA_FILES = ["INDEX.md"]; // Files to exclude from processing

async function main() {
  // Ensure target directory exists
  await ensureDir(TARGET_DIR);
  
  console.log(`Reading email files from ${SOURCE_DIR}...`);
  
  // Get all markdown files except metadata files
  const emailFiles: string[] = [];
  for await (const entry of walk(SOURCE_DIR, { 
    exts: ["md"],
    skip: [new RegExp(METADATA_FILES.join("|"))]
  })) {
    if (entry.isFile) {
      emailFiles.push(entry.path);
    }
  }
  
  console.log(`Found ${emailFiles.length} email files`);
  
  // Calculate how many emails per file
  const emailsPerFile = Math.ceil(emailFiles.length / TARGET_FILE_COUNT);
  console.log(`Will create approximately ${TARGET_FILE_COUNT} files with ~${emailsPerFile} emails per file`);
  
  // Process emails in chunks
  let fileCounter = 0;
  let processedEmails = 0;
  
  for (let i = 0; i < emailFiles.length; i += emailsPerFile) {
    fileCounter++;
    const chunk = emailFiles.slice(i, i + emailsPerFile);
    const targetFilePath = join(TARGET_DIR, `emails_batch_${String(fileCounter).padStart(3, '0')}.md`);
    
    let combinedContent = `# Email Batch ${fileCounter}\n\n`;
    combinedContent += `This file contains ${chunk.length} emails from batch ${fileCounter}.\n\n`;
    
    // Process each email in the chunk
    for (const emailFile of chunk) {
      const content = await Deno.readTextFile(emailFile);
      
      // Extract filename without path and extension for reference
      const filename = emailFile.split("/").pop()?.replace(".md", "") || "unknown";
      
      // Add separator and filename reference before each email
      combinedContent += `\n---\n\n## Email: ${filename}\n\n`;
      combinedContent += content + "\n";
      
      processedEmails++;
      if (processedEmails % 100 === 0) {
        console.log(`Processed ${processedEmails}/${emailFiles.length} emails`);
      }
    }
    
    // Write the combined content to a file
    await Deno.writeTextFile(targetFilePath, combinedContent);
    console.log(`Created file ${fileCounter}: ${targetFilePath} with ${chunk.length} emails`);
  }
  
  // Create index file
  const indexContent = `# Email Collection Index\n\nThis collection contains ${emailFiles.length} emails distributed across ${fileCounter} files.\n\n## Files\n\n${
    Array.from({ length: fileCounter }, (_, i) => {
      const num = i + 1;
      return `- [Batch ${num}](./emails_batch_${String(num).padStart(3, '0')}.md) - Contains emails from batch ${num}`;
    }).join("\n")
  }\n`;
  
  await Deno.writeTextFile(join(TARGET_DIR, "INDEX.md"), indexContent);
  
  // Also include the group files
  if (await fileExists("./output/email-groups.md")) {
    await Deno.copyFile("./output/email-groups.md", join(TARGET_DIR, "email-groups.md"));
    console.log("Copied email-groups.md to llm_ready directory");
  }
  
  if (await fileExists("./output/sender-groups.md")) {
    await Deno.copyFile("./output/sender-groups.md", join(TARGET_DIR, "sender-groups.md"));
    console.log("Copied sender-groups.md to llm_ready directory");
  }
  
  console.log(`\n✅ Done! Created ${fileCounter} consolidated files in ${TARGET_DIR}`);
  console.log(`📋 Check ${TARGET_DIR}/INDEX.md for a complete listing`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// Run the main function
main().catch(console.error);
