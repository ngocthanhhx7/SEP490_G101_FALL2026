const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();

// "T4 · 04/11" for the day chips; the days come from the server window as YYYY-MM-DD (Vietnam local days).
export const dayChipLabel = date => `${WEEKDAY_SHORT[weekday(date)]} · ${date.slice(8, 10)}/${date.slice(5, 7)}`;
// "Thứ Năm 05/11/2026 · 10:00" for the price panel.
export const appointmentLabel = (date, time) => `${WEEKDAY_LONG[weekday(date)]} ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)} · ${time}`;

export function windowDates(firstDate, lastDate) {
  const dates = [];
  for (let day = Date.parse(`${firstDate}T00:00:00Z`); day <= Date.parse(`${lastDate}T00:00:00Z`) && dates.length < 14; day += 86400000) dates.push(new Date(day).toISOString().slice(0, 10));
  return dates;
}

// "Chó Corgi · 12 kg" when the pet record carries a breed name; the pet list only has `breedCode`, so then "Chó · 12 kg".
export const petKindLabel = pet => `${pet.species === 'CAT' ? 'Mèo' : 'Chó'}${typeof pet.breedName === 'string' && pet.breedName.trim() ? ` ${pet.breedName.trim()}` : ''}${Number.isFinite(pet.weightKg) ? ` · ${pet.weightKg} kg` : ''}`;

// A pet that bites or scratches ("YES") cannot be booked online (MSG63): it stays out of slots, price and booking.
export const isReferred = choice => choice.answers.biteOrScratch === 'YES';
export const isAnswered = choice => Boolean(choice.answers.biteOrScratch && choice.answers.skinCondition);

// The pets of the order: chosen, not referred. `rows` are [petId, choice] pairs.
export const orderedPets = picked => Object.entries(picked).filter(([, choice]) => !isReferred(choice));
export const slotPets = picked => orderedPets(picked).filter(([, choice]) => choice.serviceIds.length > 0)
  .map(([petId, choice]) => ({ petId, serviceIds: choice.serviceIds }));
export const quotePets = picked => orderedPets(picked).map(([petId, choice]) => ({ petId, serviceIds: choice.serviceIds, answers: choice.answers }));
// Every pet of the order needs a service and both answers before the price can be asked.
export const orderReady = picked => { const rows = orderedPets(picked); return rows.length > 0 && rows.every(([, choice]) => choice.serviceIds.length > 0 && isAnswered(choice)); };
