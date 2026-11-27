export const completeChecklist = Object.freeze({ validIdentity: true, adult: true, portrait: true, petExperience: true });

export function assessmentInput(expectedVersion, expectedAssessmentVersion, fields = {}) {
  return { expectedVersion, expectedAssessmentVersion, checklist: completeChecklist, callAt: null, outcome: null, ...fields };
}
