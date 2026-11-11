import { vaccinationNote, vaccinationRows } from '../../src/utils/pet-vaccinations.js';
test('supports independent dates and unknown date without guessing dates from legacy notes',()=>{
  const rows=[{name:'Dại',date:'2026-10-01'},{name:'Mũi trên sổ',date:''}];
  expect(vaccinationRows(vaccinationNote(rows))).toEqual(rows);
  expect(vaccinationRows('Theo sổ: mũi tổng hợp tháng 10/2025')).toEqual([{name:'Theo sổ: mũi tổng hợp tháng 10/2025',date:''}]);
  expect(vaccinationNote([{name:'',date:'2026-10-01'}])).toBe('');
});
