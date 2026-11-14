import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiResource } from './useApiResource.js';
import { apiErrorFeedback } from '../utils/api-error-feedback.js';
import { isUncertainOutcome } from '../utils/product-format.js';
import { MSG64 } from '../constants/grooming-messages.js';
import { orderReady, quotePets, slotPets } from '../utils/grooming-booking.js';

const UNCERTAIN = 'Chưa nhận được xác nhận lịch hẹn. Bạn có thể bấm "Xác nhận đặt lịch" lần nữa: một lịch đã đặt sẽ không bị đặt hai lần.';
const blank = { status: 'idle' };
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

// State of the shop grooming booking page: pets with their services and answers, the day and time slot, the final price and
// the confirmation. Pets that bite or scratch ("YES", MSG63) stay out of slots, price and booking.
export function useGroomingBooking({ api, serviceId }) {
  const load = useCallback(async ({ signal }) => {
    const [options, pets] = await Promise.all([api.options({ signal }), api.pets({ signal })]);
    return { data: { options, pets } };
  }, [api]);
  const setup = useApiResource(load);
  const options = setup.data?.options ?? null, pets = setup.data?.pets ?? [];
  const [picked, setPicked] = useState({}), [date, setDate] = useState(''), [time, setTime] = useState('');
  const [slots, setSlots] = useState(blank), [quote, setQuote] = useState(blank);
  const [slotRevision, setSlotRevision] = useState(0), [quoteRevision, setQuoteRevision] = useState(0);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [booked, setBooked] = useState(null);
  const command = useRef(null), locked = useRef(false);

  useEffect(() => { if (options && !date) setDate(options.window.firstDate); }, [options, date]);

  const slotKey = date && slotPets(picked).length ? JSON.stringify({ date, pets: slotPets(picked) }) : '';
  useEffect(() => {
    if (!slotKey) { setSlots(blank); return undefined; }
    const controller = new AbortController();
    setSlots({ status: 'loading' });
    api.slots(JSON.parse(slotKey), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setSlots({ status: 'success', items: data.slots }); })
      .catch(error => { if (!controller.signal.aborted) setSlots({ status: 'error', error }); });
    return () => controller.abort();
  }, [api, slotKey, slotRevision]);

  const ready = orderReady(picked);
  const quoteKey = ready ? JSON.stringify(quotePets(picked)) : '';
  useEffect(() => {
    if (!quoteKey) { setQuote(blank); return undefined; }
    const controller = new AbortController();
    setQuote({ status: 'loading' });
    api.quote({ pets: JSON.parse(quoteKey) }, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setQuote({ status: 'success', data, key: quoteKey }); })
      .catch(error => { if (!controller.signal.aborted) setQuote({ status: 'error', error }); });
    return () => controller.abort();
  }, [api, quoteKey, quoteRevision]);

  const selectedSlot = slots.status === 'success' ? slots.items.find(item => item.startAt === time && item.state === 'AVAILABLE') ?? null : null;
  const priceReady = quote.status === 'success' && quote.key === quoteKey;
  const canConfirm = ready && priceReady && Boolean(selectedSlot) && !busy;

  function changed() { setNotice(''); command.current = null; }
  const togglePet = pet => { changed(); setPicked(current => {
    if (current[pet.id]) return without(current, pet.id);
    const first = options.services.find(row => row.id === serviceId && row.bookable && row.species.includes(pet.species));
    return { ...current, [pet.id]: { serviceIds: first ? [first.id] : [], answers: { biteOrScratch: null, skinCondition: null } } };
  }); };
  const toggleService = (petId, id) => { changed(); setPicked(current => {
    const ids = current[petId].serviceIds;
    return { ...current, [petId]: { ...current[petId], serviceIds: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id] } };
  }); };
  const answer = (petId, code, value) => { changed(); setPicked(current => ({ ...current,
    [petId]: { ...current[petId], answers: { ...current[petId].answers, [code]: value } } })); };
  const chooseDate = value => { changed(); setDate(value); setTime(''); };
  const chooseTime = value => { setNotice(''); setTime(value); };

  async function confirm() {
    if (locked.current || !canConfirm) return;
    const body = { startAt: selectedSlot.startAt, pets: quotePets(picked), expectedTotalVnd: quote.data.totalVnd };
    // The same key is reused for an unchanged request, so a retry after an uncertain reply can never book twice.
    const fingerprint = JSON.stringify(body);
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, key: `grooming:${globalThis.crypto.randomUUID()}` };
    locked.current = true; setBusy(true); setNotice('');
    try {
      setBooked(await api.book(body, command.current.key));
      command.current = null;
    } catch (error) {
      if (error.code === 'GROOMING_SLOT_TAKEN') {
        command.current = null; setNotice(MSG64); setTime(''); setSlotRevision(value => value + 1);
      } else if (error.code === 'GROOMING_PRICE_CHANGED' || error.code === 'GROOMING_PET_ALREADY_BOOKED') {
        command.current = null; setNotice(error.serverMessage || apiErrorFeedback(error));
        if (error.code === 'GROOMING_PRICE_CHANGED') setQuoteRevision(value => value + 1);
      } else if (error.code === 'GROOMING_PET_REFERRAL_REQUIRED' && error.details?.petId && picked[error.details.petId]) {
        command.current = null; answer(error.details.petId, 'biteOrScratch', 'YES');
      } else if (isUncertainOutcome(error)) {
        setNotice(UNCERTAIN);
      } else {
        command.current = null; setNotice(apiErrorFeedback(error, 'Chưa đặt được lịch. Vui lòng thử lại.'));
      }
    } finally { locked.current = false; setBusy(false); }
  }

  return { setup, options, pets, picked, date, time, slots, quote, priceReady, selectedSlot, canConfirm, notice, busy, booked,
    togglePet, toggleService, answer, chooseDate, chooseTime, confirm,
    reloadSlots: () => setSlotRevision(value => value + 1), reloadQuote: () => setQuoteRevision(value => value + 1) };
}
