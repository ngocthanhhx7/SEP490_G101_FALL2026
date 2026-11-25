const legacyLabels = { CITY_HANOI: 'Hà Nội' };

export function sitterAreaLabel({ areaLabel, areaCode }) {
  const label = areaLabel?.trim();
  if (label && label !== areaCode) return label;
  return (Object.hasOwn(legacyLabels, areaCode) && legacyLabels[areaCode]) || 'Chưa rõ khu vực';
}
