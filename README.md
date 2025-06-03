# Email Parser and Analyzer

A Deno-based tool for parsing, filtering, and analyzing email data from mbox files.

## Overview

This project provides a set of tools to:

1. Parse and extract emails from mbox files
2. Filter out unwanted emails (self-emails, automated notifications)
3. Group similar emails by subject for easier analysis
4. Export emails to markdown format for better readability

## Features

- **Efficient mbox parsing**: Handles large mbox files by processing them in chunks
- **Configurable filtering**: Easily customize which emails to ignore
- **Memory-optimized grouping**: Groups similar emails without excessive memory usage
- **Markdown export**: Converts emails to readable markdown format
- **Subject similarity analysis**: Groups emails with similar subjects using Jaccard similarity

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) (version 1.x or higher)
- Unix-like environment (for `csplit` command)

### Installation

1. Clone this repository
2. Copy `config.sample.ts` to `config.ts` and customize it with your email addresses and ignored senders

```bash
cp config.sample.ts config.ts
```

### Configuration

Edit `config.ts` to customize:

- `myEmails`: List of your email addresses for filtering self-emails
- `myNames`: List of your names for filtering self-emails
- `ignoredSenders`: List of senders to ignore (automated emails, notifications, etc.) including:
  - System notifications (Cover Admin, Mail Delivery Subsystem)
  - Service notifications (AWS, Heroku, Parse status updates)
  - Marketing emails and auto-replies
  - Internal system emails (reporting@velocityapp.com, development@velocityapp.com)

## Usage

### Parsing Emails

To parse emails from an mbox file:

```bash
deno task convert -i your-mail.mbox
```

You can also filter emails by date using the `--since-date` and/or `--until-date` options:

```bash
deno task convert -i your-mail.mbox --since-date 2023-01-01
deno task convert -i your-mail.mbox --until-date 2023-12-31
deno task convert -i your-mail.mbox --since-date 2023-01-01 --until-date 2023-12-31
```

This will:
1. Parse the mbox file
2. Extract email metadata
3. Filter emails to only include those on or after the specified date
4. Save each email as a separate markdown file in the `output/emails` directory
5. Create an index file at `output/emails/INDEX.md`

Options:
- `-i, --input <file>`: Path to the mbox file (required)
- `-o, --output <dir>`: Output directory for markdown files (default: `./output/emails`)
- `-d, --since-date <YYYY-MM-DD>`: Only include emails on or after this date
- `-u, --until-date <YYYY-MM-DD>`: Only include emails before this date

### Grouping Similar Emails

To group similar emails by subject:

```bash
deno task group
```

This will analyze all emails in the `output/emails` directory and create a report file `output/email-groups.md` with groups of similar emails.

Options:
- `-d, --dir <path>`: Directory containing markdown email files (default: `./output/emails`)
- `-o, --output <file>`: Output file path (default: `./output/email-groups.md`)
- `-t, --threshold <number>`: Similarity threshold (0.0-1.0, default: 0.5)
- `-c, --chunk-size <number>`: Number of emails to process per chunk (default: 500)

### Grouping Emails by Sender

To group emails by sender and see which senders have sent the most emails:

```bash
deno task senders
```

This will analyze all emails in the `output/emails` directory and create a report file `output/sender-groups.md` with emails grouped by sender, sorted by email count (most active senders first).

Options:
- `-d, --dir <path>`: Directory containing markdown email files (default: `./output/emails`)
- `-o, --output <file>`: Output file path (default: `./output/sender-groups.md`)
- `-c, --chunk-size <number>`: Number of emails to process per chunk (default: 500)

### Creating LLM-Ready Files

To create consolidated files for LLM analysis (e.g., for Google NotebookLM's 300 file limit):

```bash
deno task llm
```

This will combine all emails from the `output/emails` directory into approximately 300 consolidated files in the `llm_ready` directory, making them suitable for import into LLM tools with file limits.

## Project Structure

- `src/`: Source code directory
  - `convert.ts`: Main email parsing script
  - `group-emails.ts`: Email grouping script by subject similarity
  - `group-by-sender.ts`: Email grouping script by sender
  - `create-llm-files.ts`: Script for creating LLM-ready consolidated files
  - `config.ts`: Configuration file (gitignored)
  - `config.sample.ts`: Sample configuration template
- `output/`: Directory for all generated files
  - `emails/`: Directory where parsed emails are saved as markdown
  - `email-groups.md`: Markdown report of emails grouped by subject
  - `sender-groups.md`: Markdown report of emails grouped by sender
- `llm_ready/`: Directory containing consolidated files for LLM analysis

## Memory Optimization

The email grouping script is designed to handle large numbers of emails by:

1. Processing emails in configurable chunks (default: 500 emails per chunk)
2. Incrementally merging groups across chunks
3. Clearing references between iterations to aid garbage collection

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
