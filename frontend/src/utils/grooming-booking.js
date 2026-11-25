const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();

// "Thứ Năm 05/11/2026 · 10:00" for the price panel.
export const appointmentLabel = (date, time) => `${WEEKDAY_LONG[weekday(date)]} ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)} · ${time}`;

export const petKindLabel = pet => {
  const kind = pet.species === 'CAT' ? 'Mèo' : 'Chó';
  const breedName = typeof pet.breedName === 'string' ? pet.breedName.trim() : '';
  const [firstWord] = breedName.toLowerCase().split(/\s+/u, 1);
  const label = firstWord === kind.toLowerCase() ? breedName : [kind, breedName].filter(Boolean).join(' ');
  return `${label}${Number.isFinite(pet.weightKg) ? ` · ${pet.weightKg} kg` : ''}`;
};

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
