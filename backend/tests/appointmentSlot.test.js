
const {
  findMatchingPublishedSlot
} = require("../utils/appointmentSlot");

const THIRTY_MINUTES = 30 * 60 * 1000;

// Create a future appointment slot.
function createSlot(durationMinutes = 30) {
  const startAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  );

  const endAt = new Date(
    startAt.getTime() + durationMinutes * 60 * 1000
  );

  return {
    startAt,
    endAt
  };
}

describe("findMatchingPublishedSlot()", () => {

  test("should return a matching 30-minute published slot", () => {
    const slot = createSlot(30);

    const result = findMatchingPublishedSlot(
      [slot],
      slot.startAt
    );

    expect(result).toBe(slot);
  });

  test("should reject a different start time", () => {
    const slot = createSlot(30);

    const differentStart = new Date(
      slot.startAt.getTime() + 60 * 60 * 1000
    );

    const result = findMatchingPublishedSlot(
      [slot],
      differentStart
    );

    expect(result).toBeNull();
  });

  test("should reject a slot that is not 30 minutes", () => {
    const slot = createSlot(15);

    const result = findMatchingPublishedSlot(
      [slot],
      slot.startAt
    );

    expect(result).toBeNull();
  });

  test("should return null when availability is empty", () => {
    const result = findMatchingPublishedSlot(
      [],
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    expect(result).toBeNull();
  });

  test("should return null when availability is invalid", () => {
    const result = findMatchingPublishedSlot(
      null,
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    expect(result).toBeNull();
  });

  test("should return null for an invalid requested date", () => {
    const slot = createSlot(30);

    const invalidDate = new Date("invalid-date");

    const result = findMatchingPublishedSlot(
      [slot],
      invalidDate
    );

    expect(result).toBeNull();
  });

});
