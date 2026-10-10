/** Log-safe forms of contact details: enough to debug, not enough to identify. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 4 ? `***${digits.slice(-4)}` : '***'
}
