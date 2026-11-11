import { useRef, useState } from 'react';
import { avatarPath, AVATAR_CHANGED } from '../services/avatar-api.js';
import { customerPetBody } from '../utils/customer-pet-profile.js';

const uncertain = error => !error.status || [408, 425, 429].includes(error.status) || error.status >= 500 || (error.status >= 200 && error.status < 300);
// Pet creation and its optional photo are separate existing commands. Retain each
// acknowledgement/key independently so a photo retry can never create another pet.
export function usePetCreation({ api, photoApi, onSaved }) {
  const [state, setState] = useState('idle'), [message, setMessage] = useState(''), [created, setCreated] = useState(null);
  const createAttempt = useRef(null), photoAttempt = useRef(null), pet = useRef(null), lock = useRef(false), unconfirmed = useRef(false);
  async function save(draft, file) {
    if (lock.current) return;
    lock.current = true; setState('saving'); setMessage('');
    let phase = 'pet';
    try {
      if (typeof globalThis.crypto?.randomUUID !== 'function') throw Object.assign(new Error('Secure operation key unavailable'), { status: 422 });
      if (!pet.current) {
        if (!createAttempt.current) createAttempt.current = { body: customerPetBody(draft), key: globalThis.crypto.randomUUID() };
        const result = await api.save('pets', undefined, createAttempt.current.body, createAttempt.current.key);
        if (result.pending || !/^[a-f0-9]{24}$/i.test(result.data?.id ?? '') || result.data?.version !== 0) throw Object.assign(new Error('Uncertain creation'), { status: 202 });
        pet.current = result.data; setCreated(result.data); unconfirmed.current = false;
      }
      phase = 'photo';
      if (file) {
        const path = avatarPath(pet.current.id);
        if (!photoAttempt.current) {
          const meta = await photoApi.get(path);
          // Newly-created pets should have no photo. Do not overwrite a photo
          // changed in another tab without the existing profile editor's review.
          if (meta.data.present) throw Object.assign(new Error('Photo exists'), { status: 409 });
          photoAttempt.current = { file, version: meta.data.version, key: globalThis.crypto.randomUUID() };
        }
        const result = await photoApi.save(path, photoAttempt.current);
        if (result.pending || result.data?.version !== photoAttempt.current.version + 1 || result.data?.present !== true) throw Object.assign(new Error('Uncertain photo'), { status: 202 });
        window.dispatchEvent(new window.CustomEvent(AVATAR_CHANGED, { detail: { path } }));
      }
      setState('done'); onSaved(pet.current, Boolean(file));
    } catch (error) {
      // A later auth/validation denial cannot establish whether an earlier
      // timed-out command committed. Keep its key/body until an acknowledgement.
      const pending = uncertain(error) || unconfirmed.current;
      if (pending) unconfirmed.current = true;
      setState(pending ? 'pending' : 'error');
      if (phase === 'pet') {
        if (!pending) createAttempt.current = null;
        setMessage(pending ? 'Chưa nhận được xác nhận tạo hồ sơ. Thử lại cùng yêu cầu để tránh tạo trùng bé.' : 'Chưa lưu được hồ sơ. Kiểm tra thông tin và phiên đăng nhập rồi thử lại.');
      } else {
        if (!pending) photoAttempt.current = null;
        setMessage(pending ? 'Hồ sơ đã được lưu; ảnh chưa có xác nhận. Thử lại cùng yêu cầu để đối chiếu ảnh.' : 'Hồ sơ đã được lưu nhưng ảnh chưa hoàn tất. Bạn có thể thử lại ảnh hoặc cập nhật ảnh sau trong hồ sơ.');
      }
    } finally { lock.current = false; }
  }
  return { state, message, created, save, finishWithoutPhoto: () => { if (pet.current && state === 'error' && !lock.current) onSaved(pet.current, false); } };
}
