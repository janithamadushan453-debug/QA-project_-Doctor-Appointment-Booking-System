
const THIRTY_MINUTES = 30 * 60 * 1000;

function findMatchingPublishedSlot(
  availability,
  requestedStart
) {
  // Validate availability.
  if (!Array.isArray(availability)) {
    return null;
  }

  // Validate requested date.
  if (
    !(requestedStart instanceof Date) ||
    !Number.isFinite(requestedStart.getTime())
  ) {
    return null;
  }

  // Find an exact matching 30-minute slot.
  const matchingSlot = availability.find((slot) => {

    if (
      !slot ||
      !(slot.startAt instanceof Date) ||
      !(slot.endAt instanceof Date)
    ) {
      return false;
    }

    const duration =
      slot.endAt.getTime() - slot.startAt.getTime();

    const startMatches =
      slot.startAt.getTime() === requestedStart.getTime();

    return (
      startMatches &&
      duration === THIRTY_MINUTES
    );
  });

  return matchingSlot || null;
}

module.exports = {
  findMatchingPublishedSlot
};
