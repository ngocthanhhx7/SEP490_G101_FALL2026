// One page of a list plus the total, for any Mongoose model. A page past the end is empty and still reports the total,
// so the screen can step back. The total is counted separately from the page, so it can be one change behind under writes.
export async function paginate(model, { filter = {}, sort, page, limit }) {
  const [items, total] = await Promise.all([
    model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    model.countDocuments(filter)
  ]);
  return { items, page, limit, total };
}
