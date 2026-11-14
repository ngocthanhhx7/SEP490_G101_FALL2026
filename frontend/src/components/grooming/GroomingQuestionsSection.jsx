import { GroomingChip } from './GroomingChip.jsx';
import { VERY_RISKY_NOTE, msg63 } from '../../constants/grooming-messages.js';
import { isReferred } from '../../utils/grooming-booking.js';

// Step 2: the fixed questions of every chosen pet. A pet that bites or scratches shows MSG63 and leaves the order.
export function GroomingQuestionsSection({ pets, options, picked, hotline, onAnswer }) {
  const rows = pets.filter(pet => picked[pet.id]);
  return <section className="grooming-card" aria-labelledby="grooming-questions">
    <h2 id="grooming-questions">2. Câu hỏi về từng thú</h2>
    <p>Câu trả lời giúp nhân viên chuẩn bị. Giá có thể đổi nếu thú khác với câu trả lời; nhân viên báo bạn trước khi làm.</p>
    {!rows.length && <p className="grooming-hint">Chọn thú cưng ở bước 1 để trả lời câu hỏi.</p>}
    {rows.map(pet => {
      const choice = picked[pet.id];
      return <div key={pet.id} className="grooming-questions">
        <h3>{pet.name}</h3>
        {options.questions.map(question => <fieldset key={question.code}>
          <legend>{question.text}</legend>
          <div className="grooming-chips">{question.answers.map(([value, label]) => <GroomingChip key={value} type="radio"
            name={`${pet.id}-${question.code}`} checked={choice.answers[question.code] === value}
            onChange={() => onAnswer(pet.id, question.code, value)}>{label}</GroomingChip>)}</div>
        </fieldset>)}
        {isReferred(choice) && <p role="alert" className="grooming-inline grooming-inline-warn">{msg63(hotline)}</p>}
      </div>;
    })}
    {!rows.some(pet => isReferred(picked[pet.id])) && <p className="grooming-note">{VERY_RISKY_NOTE}</p>}
  </section>;
}
