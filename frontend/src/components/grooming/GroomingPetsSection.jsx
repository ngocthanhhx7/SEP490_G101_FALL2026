import { Link } from 'react-router-dom';
import { GroomingChip } from './GroomingChip.jsx';
import { NO_PETS } from '../../constants/grooming-messages.js';
import { petKindLabel } from '../../utils/grooming-booking.js';

// Step 1: the pets to bring and, for each chosen pet, the shop services it gets.
export function GroomingPetsSection({ pets, options, picked, onTogglePet, onToggleService }) {
  return <section className="grooming-card" aria-labelledby="grooming-pets">
    <h2 id="grooming-pets">1. Thú cưng và dịch vụ</h2>
    <p>Chọn thú cưng mang đến và dịch vụ cho từng thú.</p>
    {!pets.length && <p role="status" className="grooming-empty">{NO_PETS} <Link to="/account/pets">Thêm thú cưng</Link></p>}
    {pets.map(pet => {
      const choice = picked[pet.id];
      const services = options.services.filter(row => row.species.includes(pet.species));
      return <article key={pet.id} className={`grooming-pet${choice ? ' is-picked' : ''}`}>
        <label className="grooming-pet-head">
          <input type="checkbox" checked={Boolean(choice)} onChange={() => onTogglePet(pet)} />
          <strong>{pet.name}</strong><span>{petKindLabel(pet)}</span>
        </label>
        {choice && <div className="grooming-chips" role="group" aria-label={`Dịch vụ cho ${pet.name}`}>
          {services.map(row => <GroomingChip key={row.id} checked={choice.serviceIds.includes(row.id)} disabled={!row.bookable}
            onChange={() => onToggleService(pet.id, row.id)}>{row.name}{row.bookable ? '' : ' · tạm ngưng'}</GroomingChip>)}
        </div>}
      </article>;
    })}
  </section>;
}
