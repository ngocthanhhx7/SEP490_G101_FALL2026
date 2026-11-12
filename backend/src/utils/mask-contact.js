export function maskContact(channel, value) {
  if (channel === 'EMAIL') {
    const separator = value.lastIndexOf('@');
    const local = value.slice(0, separator);
    const domain = value.slice(separator + 1);
    return `${local[0] ?? ''}${'*'.repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;
  }
  return `+${'•'.repeat(Math.max(4, value.length - 5))}${value.slice(-4)}`;
}
