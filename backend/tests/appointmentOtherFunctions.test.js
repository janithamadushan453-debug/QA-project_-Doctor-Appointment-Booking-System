
/*
  EC4206 - Software Testing and Quality Assurance
  Member 1 - Section 3.4 and 3.5
  Additional Jest Tests for Appointment Controller
*/

jest.mock("../models/Appointment", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn()
}));

jest.mock("../models/Doctor", () => ({
  findOne: jest.fn()
}));

const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");

const {
  getMyAppointments,
  cancelAppointment,
  rescheduleAppointment,
  getAdminAppointments,
  completeAppointment,
  deleteCancelledAppointment
} = require("../controllers/appointmentController");

const APPOINTMENT_ID = "64b000000000000000000001";
const DOCTOR_ID = "64b000000000000000000002";
const PATIENT_ID = "64b000000000000000000003";

// Mock Express response object
function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

// Mock Mongoose query chain
function createQuery(result) {
  const query = {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockResolvedValue(result)
  };

  return query;
}

// Generate future dates dynamically
function futureDate(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// Common reschedule test data
function createRescheduleContext() {
  const previousStart = futureDate(24);
  const newStart = futureDate(48);

  const existingAppointment = {
    _id: APPOINTMENT_ID,
    doctorId: DOCTOR_ID,
    startAt: previousStart,
    endAt: new Date(
      previousStart.getTime() + 30 * 60 * 1000
    ),
    status: "booked"
  };

  const newSlot = {
    startAt: newStart,
    endAt: new Date(
      newStart.getTime() + 30 * 60 * 1000
    )
  };

  const doctor = {
    _id: DOCTOR_ID,
    isActive: true,
    availability: [newSlot]
  };

  const req = {
    params: { id: APPOINTMENT_ID },
    body: { startAt: newStart.toISOString() },
    user: { _id: PATIENT_ID }
  };

  const res = createResponse();

  return {
    req,
    res,
    existingAppointment,
    newSlot,
    doctor,
    previousStart
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});


// ==================================================
// 1. getMyAppointments()
// ==================================================

describe("getMyAppointments()", () => {

  test("should return the patient's appointments", async () => {
    const appointments = [
      { _id: APPOINTMENT_ID, status: "booked" }
    ];

    const query = createQuery(appointments);
    Appointment.find.mockReturnValue(query);

    const req = {
      user: { _id: PATIENT_ID }
    };

    const res = createResponse();

    await getMyAppointments(req, res);

    expect(Appointment.find).toHaveBeenCalledWith({
      patientId: PATIENT_ID
    });

    expect(query.populate).toHaveBeenCalledWith(
      "doctorId",
      "name specialization"
    );

    expect(query.sort).toHaveBeenCalledWith({
      startAt: 1
    });

    expect(res.json).toHaveBeenCalledWith({
      appointments
    });
  });

  test("should return 500 when loading appointments fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    Appointment.find.mockImplementation(() => {
      throw new Error("Database error");
    });

    const req = {
      user: { _id: PATIENT_ID }
    };

    const res = createResponse();

    await getMyAppointments(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to load appointments"
    });
  });

});


// ==================================================
// 2. cancelAppointment()
// ==================================================

describe("cancelAppointment()", () => {

  test("should reject an invalid appointment ID", async () => {
    const req = {
      params: { id: "invalid-id" },
      user: { _id: PATIENT_ID }
    };

    const res = createResponse();

    await cancelAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(Appointment.findOneAndUpdate)
      .not.toHaveBeenCalled();
  });

  test("should successfully cancel a booking", async () => {
    const cancelledAppointment = {
      _id: APPOINTMENT_ID,
      status: "cancelled"
    };

    Appointment.findOneAndUpdate.mockResolvedValue(
      cancelledAppointment
    );

    const req = {
      params: { id: APPOINTMENT_ID },
      user: { _id: PATIENT_ID }
    };

    const res = createResponse();

    await cancelAppointment(req, res);

    expect(
      Appointment.findOneAndUpdate
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        status: "booked",
        startAt: {
          $gt: expect.any(Date)
        }
      }),
      {
        $set: { status: "cancelled" }
      },
      {
        new: true,
        runValidators: true
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "Appointment cancelled",
      appointment: cancelledAppointment
    });
  });

  test("should return 409 when appointment cannot be cancelled", async () => {
    Appointment.findOneAndUpdate.mockResolvedValue(null);

    const req = {
      params: { id: APPOINTMENT_ID },
      user: { _id: PATIENT_ID }
    };

    const res = createResponse();

    await cancelAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("should return 500 when cancellation fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    Appointment.findOneAndUpdate.mockRejectedValue(
      new Error("Database error")
    );

    const req = {
      params: { id: APPOINTMENT_ID },
      user: { _id: PATIENT_ID }
    };

    const res = createResponse();

    await cancelAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to cancel the appointment"
    });
  });

});


// ==================================================
// 3. rescheduleAppointment()
// ==================================================

describe("rescheduleAppointment()", () => {

  test("should reject an invalid appointment ID", async () => {
    const ctx = createRescheduleContext();

    ctx.req.params.id = "wrong-id";

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(400);
  });

  test("should reject a missing or invalid timezone", async () => {
    const ctx = createRescheduleContext();

    ctx.req.body.startAt =
      "2026-11-26T10:00:00";

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(400);
  });

  test("should reject a past appointment date", async () => {
    const ctx = createRescheduleContext();

    ctx.req.body.startAt = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(400);
  });

  test("should return 409 when the existing appointment is unavailable", async () => {
    const ctx = createRescheduleContext();

    Appointment.findOne.mockResolvedValue(null);

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(409);

    expect(Doctor.findOne).not.toHaveBeenCalled();
  });

  test("should return 409 when the doctor is unavailable", async () => {
    const ctx = createRescheduleContext();

    Appointment.findOne.mockResolvedValue(
      ctx.existingAppointment
    );

    Doctor.findOne.mockResolvedValue(null);

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(Doctor.findOne).toHaveBeenCalledWith({
      _id: DOCTOR_ID,
      isActive: true
    });

    expect(ctx.res.status).toHaveBeenCalledWith(409);
  });

  test("should reject an unpublished new slot", async () => {
    const ctx = createRescheduleContext();

    Appointment.findOne.mockResolvedValue(
      ctx.existingAppointment
    );

    Doctor.findOne.mockResolvedValue({
      ...ctx.doctor,
      availability: []
    });

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(400);

    expect(Appointment.findOneAndUpdate)
      .not.toHaveBeenCalled();
  });

  test("should reject the same appointment time", async () => {
    const ctx = createRescheduleContext();

    const sameSlot = {
      startAt: ctx.previousStart,
      endAt: new Date(
        ctx.previousStart.getTime() + 30 * 60 * 1000
      )
    };

    ctx.req.body.startAt =
      ctx.previousStart.toISOString();

    Appointment.findOne.mockResolvedValue(
      ctx.existingAppointment
    );

    Doctor.findOne.mockResolvedValue({
      ...ctx.doctor,
      availability: [sameSlot]
    });

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(400);
  });

  test("should successfully reschedule an appointment", async () => {
    const ctx = createRescheduleContext();

    const updatedAppointment = {
      ...ctx.existingAppointment,
      startAt: ctx.newSlot.startAt,
      endAt: ctx.newSlot.endAt
    };

    Appointment.findOne.mockResolvedValue(
      ctx.existingAppointment
    );

    Doctor.findOne.mockResolvedValue(ctx.doctor);

    Appointment.findOneAndUpdate.mockResolvedValue(
      updatedAppointment
    );

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(Appointment.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: APPOINTMENT_ID,
        patientId: PATIENT_ID,
        status: "booked"
      }),
      {
        $set: {
          startAt: ctx.newSlot.startAt,
          endAt: ctx.newSlot.endAt
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    expect(ctx.res.json).toHaveBeenCalledWith({
      message: "Appointment rescheduled successfully",
      appointment: updatedAppointment
    });
  });

  test("should return 409 when appointment changes during rescheduling", async () => {
    const ctx = createRescheduleContext();

    Appointment.findOne.mockResolvedValue(
      ctx.existingAppointment
    );

    Doctor.findOne.mockResolvedValue(ctx.doctor);

    Appointment.findOneAndUpdate.mockResolvedValue(null);

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(409);
  });

  test("should return 409 for a duplicate rescheduled slot", async () => {
    const ctx = createRescheduleContext();

    const duplicateError = new Error("Duplicate booking");
    duplicateError.code = 11000;

    Appointment.findOne.mockResolvedValue(
      ctx.existingAppointment
    );

    Doctor.findOne.mockResolvedValue(ctx.doctor);

    Appointment.findOneAndUpdate.mockRejectedValue(
      duplicateError
    );

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(409);

    expect(ctx.res.json).toHaveBeenCalledWith({
      message: "That slot was just booked. Choose another slot."
    });
  });

  test("should return 500 for an unexpected rescheduling error", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    const ctx = createRescheduleContext();

    Appointment.findOne.mockRejectedValue(
      new Error("Database error")
    );

    await rescheduleAppointment(ctx.req, ctx.res);

    expect(ctx.res.status).toHaveBeenCalledWith(500);

    expect(ctx.res.json).toHaveBeenCalledWith({
      message: "Unable to reschedule the appointment"
    });
  });

});


// ==================================================
// 4. getAdminAppointments()
// ==================================================

describe("getAdminAppointments()", () => {

  test("should reject an invalid appointment status", async () => {
    const req = {
      query: { status: "pending" }
    };

    const res = createResponse();

    await getAdminAppointments(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(Appointment.find).not.toHaveBeenCalled();
  });

  test("should reject a non-string appointment status", async () => {
    const req = {
      query: { status: ["booked"] }
    };

    const res = createResponse();

    await getAdminAppointments(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("should return all appointments when no status is supplied", async () => {
    const appointments = [
      { _id: APPOINTMENT_ID, status: "booked" }
    ];

    const query = createQuery(appointments);

    Appointment.find.mockReturnValue(query);

    const req = { query: {} };
    const res = createResponse();

    await getAdminAppointments(req, res);

    expect(Appointment.find).toHaveBeenCalledWith({});

    expect(query.populate).toHaveBeenNthCalledWith(
      1,
      "patientId",
      "name email phone"
    );

    expect(query.populate).toHaveBeenNthCalledWith(
      2,
      "doctorId",
      "name specialization"
    );

    expect(query.sort).toHaveBeenCalledWith({
      startAt: -1
    });

    expect(res.json).toHaveBeenCalledWith({
      appointments
    });
  });

  test("should filter appointments by status", async () => {
    const appointments = [
      { _id: APPOINTMENT_ID, status: "booked" }
    ];

    const query = createQuery(appointments);

    Appointment.find.mockReturnValue(query);

    const req = {
      query: { status: "booked" }
    };

    const res = createResponse();

    await getAdminAppointments(req, res);

    expect(Appointment.find).toHaveBeenCalledWith({
      status: "booked"
    });

    expect(res.json).toHaveBeenCalledWith({
      appointments
    });
  });

  test("should return 500 when admin appointment loading fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    Appointment.find.mockImplementation(() => {
      throw new Error("Database error");
    });

    const req = { query: {} };
    const res = createResponse();

    await getAdminAppointments(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to load appointments"
    });
  });

});


// ==================================================
// 5. completeAppointment()
// ==================================================

describe("completeAppointment()", () => {

  test("should reject an invalid appointment ID", async () => {
    const req = {
      params: { id: "invalid" }
    };

    const res = createResponse();

    await completeAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("should successfully complete an eligible appointment", async () => {
    const completedAppointment = {
      _id: APPOINTMENT_ID,
      status: "completed"
    };

    Appointment.findOneAndUpdate.mockResolvedValue(
      completedAppointment
    );

    const req = {
      params: { id: APPOINTMENT_ID }
    };

    const res = createResponse();

    await completeAppointment(req, res);

    expect(
      Appointment.findOneAndUpdate
    ).toHaveBeenCalledWith(
      {
        _id: APPOINTMENT_ID,
        status: "booked",
        endAt: {
          $lte: expect.any(Date)
        }
      },
      {
        $set: { status: "completed" }
      },
      {
        new: true,
        runValidators: true
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      message: "Appointment marked as completed",
      appointment: completedAppointment
    });
  });

  test("should return 409 when an appointment cannot be completed", async () => {
    Appointment.findOneAndUpdate.mockResolvedValue(null);

    const req = {
      params: { id: APPOINTMENT_ID }
    };

    const res = createResponse();

    await completeAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("should return 500 when completing an appointment fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    Appointment.findOneAndUpdate.mockRejectedValue(
      new Error("Database error")
    );

    const req = {
      params: { id: APPOINTMENT_ID }
    };

    const res = createResponse();

    await completeAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to complete the appointment"
    });
  });

});


// ==================================================
// 6. deleteCancelledAppointment()
// ==================================================

describe("deleteCancelledAppointment()", () => {

  test("should reject an invalid appointment ID", async () => {
    const req = {
      params: { id: "invalid" }
    };

    const res = createResponse();

    await deleteCancelledAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(Appointment.findOneAndDelete)
      .not.toHaveBeenCalled();
  });

  test("should successfully delete a cancelled appointment", async () => {
    Appointment.findOneAndDelete.mockResolvedValue({
      _id: APPOINTMENT_ID,
      status: "cancelled"
    });

    const req = {
      params: { id: APPOINTMENT_ID }
    };

    const res = createResponse();

    await deleteCancelledAppointment(req, res);

    expect(Appointment.findOneAndDelete).toHaveBeenCalledWith({
      _id: APPOINTMENT_ID,
      status: "cancelled"
    });

    expect(res.json).toHaveBeenCalledWith({
      message: "Cancelled appointment permanently deleted"
    });
  });

  test("should return 409 when appointment is not cancelled", async () => {
    Appointment.findOneAndDelete.mockResolvedValue(null);

    const req = {
      params: { id: APPOINTMENT_ID }
    };

    const res = createResponse();

    await deleteCancelledAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("should return 500 when deleting an appointment fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    Appointment.findOneAndDelete.mockRejectedValue(
      new Error("Database error")
    );

    const req = {
      params: { id: APPOINTMENT_ID }
    };

    const res = createResponse();

    await deleteCancelledAppointment(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Unable to delete the appointment"
    });
  });

});
