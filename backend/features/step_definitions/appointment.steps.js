
const {
  Given,
  When,
  Then,
  Before,
  After
} = require("@cucumber/cucumber");

const assert = require("node:assert/strict");

async function sendBooking(world) {
  const response = await fetch(
    `${world.apiBase}/appointments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${world.token}`
      },
      body: JSON.stringify({
        doctorId: world.doctorId,
        startAt: world.startAt,
        reason: "Routine medical checkup"
      })
    }
  );

  const body = await response.json();

  return { response, body };
}

// Login before each scenario
Before(async function () {
  this.apiBase =
    process.env.API_BASE_URL || "http://localhost:5000/api";

  const required = [
    "TEST_PATIENT_EMAIL",
    "TEST_PATIENT_PASSWORD",
    "TEST_DOCTOR_ID",
    "TEST_AVAILABLE_SLOT"
  ];

  for (const key of required) {
    assert.ok(process.env[key], `${key} is missing`);
  }

  // Check API availability
  const health = await fetch(`${this.apiBase}/health`);

  assert.equal(health.status, 200);

  // Login with test patient account
  const loginResponse = await fetch(
    `${this.apiBase}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: process.env.TEST_PATIENT_EMAIL,
        password: process.env.TEST_PATIENT_PASSWORD
      })
    }
  );

  const loginBody = await loginResponse.json();

  assert.equal(
    loginResponse.status,
    200,
    "Patient login failed"
  );

  assert.ok(loginBody.token);

  this.token = loginBody.token;
  this.doctorId = process.env.TEST_DOCTOR_ID;
  this.startAt = process.env.TEST_AVAILABLE_SLOT;
});

Given("the API is running", function () {
  assert.ok(this.apiBase);
});

Given("the patient is authenticated", function () {
  assert.ok(this.token);
});

Given(
  "the doctor has an available published slot",
  async function () {
    const response = await fetch(
      `${this.apiBase}/doctors/${this.doctorId}/slots`
    );

    const body = await response.json();

    assert.equal(response.status, 200);

    const requestedTime = new Date(
      this.startAt
    ).getTime();

    const available = (body.slots || []).some(
      slot =>
        new Date(slot.startAt).getTime() === requestedTime
    );

    assert.ok(
      available,
      "The selected slot is not currently available"
    );
  }
);

When(
  "the patient books the selected slot",
  async function () {
    const result = await sendBooking(this);

    this.response = result.response;
    this.body = result.body;

    if (this.response.status === 201) {
      this.createdAppointmentId =
        this.body.appointment?._id;
    }
  }
);

Given(
  "the selected slot is already booked",
  async function () {
    const result = await sendBooking(this);

    assert.equal(
      result.response.status,
      201,
      "Could not create the initial test booking"
    );

    this.createdAppointmentId =
      result.body.appointment?._id;

    assert.ok(this.createdAppointmentId);
  }
);

When(
  "the patient tries to book the same slot again",
  async function () {
    const result = await sendBooking(this);

    this.response = result.response;
    this.body = result.body;
  }
);

Then(
  "the API response status should be {int}",
  function (expectedStatus) {
    assert.equal(
      this.response.status,
      expectedStatus,
      JSON.stringify(this.body)
    );
  }
);

Then(
  "the appointment status should be {string}",
  function (expectedStatus) {
    assert.equal(
      this.body.appointment.status,
      expectedStatus
    );
  }
);

// Remove successful test booking after each scenario
After(async function () {
  if (!this.createdAppointmentId || !this.token) {
    return;
  }

  const response = await fetch(
    `${this.apiBase}/appointments/${this.createdAppointmentId}/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    }
  );

  if (!response.ok) {
    console.warn(
      "Test booking cleanup failed:",
      response.status
    );
  }
});
