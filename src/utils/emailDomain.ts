const ALLOWED_DOMAINS = [
  "shcg.ac.uk",
  "innovate-design.com",
  "innovate-design.co.uk",
  "logic-lab.ai",
];

// Individual email addresses allowed regardless of domain
const ALLOWED_EMAILS = [
  "sarabewes@hotmail.com",
];

export function isAllowedEmailDomain(email: string): boolean {
  const normalizedEmail = email.toLowerCase();
  if (ALLOWED_EMAILS.includes(normalizedEmail)) return true;
  const domain = normalizedEmail.split("@")[1];
  return ALLOWED_DOMAINS.includes(domain);
}
