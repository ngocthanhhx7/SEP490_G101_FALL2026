const MAILBOX =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export function isMailbox(value) {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    MAILBOX.test(value) &&
    value.split('@')[0].length <= 64
  );
}
