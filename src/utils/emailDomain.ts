const ALLOWED_DOMAINS = [
  "shcg.ac.uk",
  "innovate-design.com",
  "innovate-design.co.uk",
  "logic-lab.ai",
];

export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}
