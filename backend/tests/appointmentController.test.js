
/*
  EC4206 - Software Testing and Quality Assurance
  Member 1 - Section 3.5
  Jest Unit Tests for createAppointment()

  Target:
  controllers/appointmentController.js
*/

jest.mock("../models/Appointment", () => ({
  create: jest.fn()
}));

jest.mock("../models/Doctor", () => ({
  findOne: jest.fn()
}));

const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");

const {
  createAppointment
} = require("../controllers/appointmentController");

const DOCTOR_ID = "64b000000000000000000001";
const PATIENT_ID = "64b000000000000000000002";

// Create a valid future 30-minute slot.
function createTestContext() {
  const startAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  );

  const slot = {
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60 * 1000)
  };

  const doctor = {
    _id: DOCTOR_ID,
    isActive: true,
    availability: [slot]
  };

  const req = {
    body: {
      doctorId: DOCTOR_ID,
      startAt: startAt.toISOString(),
      reason: "  General medical checkup  "
    },
    user: {
      _id: PATIENT_ID
    }
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };

  return { req, res, doctor, slot };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("createAppointment()", () => {

  // TEST 1: Missing request body
  test("should reject a missing request body", async () => {
    const { req, res } = createTestContext();

    req.body = undefined;

    await createAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Doctor.findOne).not.toHaveBeenCalled();
  });

  // TEST 2-9: Input validation
  test.each([
    [
      "missing doctor ID",
      (ctx) => {
        delete ctx.req.body.doctorId;
      }
    ],
    [
      "invalid doctor ID",
      (ctx) => {
        ctx.req.body.doctorId = "123";
      }
    ],
    [
      "missing appointment date",
      (ctx) => {
        delete ctx.req.body.startAt;
      }
    ],
    [
      "date without timezone",
      (ctx) => {
        ctx.req.body.startAt =
          ctx.slot.startAt.toISOString().replace(/Z$/, "");
      }
    ],
    [
      "non-string reason",
      (ctx) => {
        ctx.req.body.reason = 123;
      }
    ],
    [
      "empty reason",
      (ctx) => {
        ctx.req.body.reason = "   ";
      }
    ],
    [
      "reason longer than 500 characters",
      (ctx) => {
        ctx.req.body.reason = "A".repeat(501);
      }
    ],
    [
      "invalid date value",
      (ctx) => {
        ctx.req.body.startAt = "not-a-valid-dateZ";
      }
    ],
    [
      "past appointment date",
      (ctx) => {
        ctx.req.body.startAt = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();
      }
    ]
  ])("should reject %s", async (_description, modify) => {

    const ctx = createTestContext();

    modify(ctx);

    await createAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(400);

    expect(Doctor.findOne).not.toHaveBeenCalled();

    expect(Appointment.create).not.toHaveBeenCalled();
  });

  // TEST 10: Doctor does not exist
  test("should return 404 when doctor is unavailable", async () => {

    const { req, res } = createTestContext();

    Doctor.findOne.mockResolvedValue(null);

    await createAppointment(req, res);

    expect(Doctor.findOne).toHaveBeenCalledWith({
      _id: DOCTOR_ID,
      isActive: true
    });

    expect(res.status).toHaveBeenCalledWith(404);

    expect(Appointment.create).not.toHaveBeenCalled();
  });

  // TEST 11: No published slot
  test("should reject an unpublished appointment slot", async () => {

    const { req, res, doctor } = createTestContext();

    doctor.availability = [];

    Doctor.findOne.mockResolvedValue(doctor);

    await createAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(Appointment.create).not.toHaveBeenCalled();
  });

  // TEST 12: Incorrect slot duration
  test("should reject a slot that is not 30 minutes", async () => {

    const { req, res, doctor, slot } = createTestContext();

    doctor.availability = [{
      startAt: slot.startAt,
      endAt: new Date(
        slot.startAt.getTime() + 15 * 60 * 1000
      )
    }];

    Doctor.findOne.mockResolvedValue(doctor);

    await createAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(Appointment.create).not.toHaveBeenCalled();
  });

  // TEST 13: Start time does not match a published slot
  test("should reject a different unpublished start time", async () => {

    const { req, res, doctor, slot } = createTestContext();

    doctor.availability = [{
      startAt: new Date(
        slot.startAt.getTime() + 60 * 60 * 1000
      ),
      endAt: new Date(
        slot.startAt.getTime() + 90 * 60 * 1000
      )
    }];

    Doctor.findOne.mockResolvedValue(doctor);

    await createAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // TEST 14: Successful booking
  test("should successfully create an appointment", async () => {

    const { req, res, doctor, slot } = createTestContext();

    Doctor.findOne.mockResolvedValue(doctor);

    const savedAppointment = {
      _id: "64b000000000000000000003",
      status: "booked"
    };

    Appointment.create.mockResolvedValue(savedAppointment);

    await createAppointment(req, res);

    expect(Doctor.findOne).toHaveBeenCalledWith({
      _id: DOCTOR_ID,
      isActive: true
    });

    expect(Appointment.create).toHaveBeenCalledWith({
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      startAt: slot.startAt,
      endAt: slot.endAt,
      reason: "General medical checkup",
      status: "booked"
    });

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith({
      message: "Appointment booked successfully",
      appointment: savedAppointment
    });
  });

  // TEST 15: Duplicate booking
  test("should return 409 for a duplicate appointment", async () => {

    const { req, res, doctor } = createTestContext();

    Doctor.findOne.mockResolvedValue(doctor);

    const duplicateError = new Error("Duplicate booking");
    duplicateError.code = 11000;

    Appointment.create.mockRejectedValue(duplicateError);

    await createAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith({
      message: "This slot was just booked. Choose another slot."
    });
  });

  // TEST 16: Unexpected database error
  test("should return 500 for an unexpected database error", async () => {

    const { req, res, doctor } = createTestContext();

    Doctor.findOne.mockResolvedValue(doctor);

    const databaseError = new Error("Database connection failed");

    Appointment.create.mockRejectedValue(databaseError);

    await createAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to book the appointment"
    });
  });

});
