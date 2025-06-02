// Sample configuration file for email parsing
// Copy this file to config.ts and customize as needed

// List of senders to ignore (automated emails, notifications, etc.)
export const ignoredSenders = [
  'Cover Admin',
  'no-reply@crittercism.com',
  'Cover Receipts',
  'Mail Delivery Subsystem',
  'Receipts',
  'Cover',
  'reporting@velocityapp.com',
  'development@velocityapp.com'
  // Add more senders to ignore as needed
];

// List of your own email addresses for filtering self-emails
export const myEmails = [
  'frank@hirefrank.com',
  'fcharris@gmail.com',
  'frank.harris@velocityapp.com'
  // Add more of your email addresses as needed
];

// List of your own names for filtering self-emails
export const myNames = [
  'Frank Harris',
  'Frank'
  // Add more of your names as needed
];
