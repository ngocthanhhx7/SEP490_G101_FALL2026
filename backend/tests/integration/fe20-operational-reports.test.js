import { describe, test } from '@jest/globals';

describe('FE-20 UC-89 - View Operational Reports', () => {
  test.todo('IT-FE20-UC89-01 loads Operational and Financial Reports with the last seven days by default');
  test.todo('IT-FE20-UC89-02 applies the Today date preset');
  test.todo('IT-FE20-UC89-03 applies the Last 7 days date preset');
  test.todo('IT-FE20-UC89-04 applies the This month date preset');
  test.todo('IT-FE20-UC89-05 applies the Last month date preset');
  test.todo('IT-FE20-UC89-06 loads a valid custom date range');
  test.todo('IT-FE20-UC89-07 returns MSG141 for a date range with no report data');
  test.todo('IT-FE20-UC89-08 counts Bookings created in the selected period');
  test.todo('IT-FE20-UC89-09 groups Visits by Done, Cancelled and Not started yet states');
  test.todo('IT-FE20-UC89-10 totals received booking and shop payments including tips');
  test.todo('IT-FE20-UC89-11 totals only refunds approved by Admin in the selected period');
  test.todo('IT-FE20-UC89-12 lists Bookings for the selected period');
  test.todo('IT-FE20-UC89-13 lists Visits including cancelled Visits for the selected period');
  test.todo('IT-FE20-UC89-14 lists Paid and Failed payments with reconciliation fields');
  test.todo('IT-FE20-UC89-15 includes shop appointment tips in the Payments list');
  test.todo('IT-FE20-UC89-16 lists refunds for the selected period');
  test.todo('IT-FE20-UC89-17 reloads every summary and tab after the date range changes');
  test.todo('IT-FE20-UC89-18 reflects newly created booking, payment and refund data after reload');
});
