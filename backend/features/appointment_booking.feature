
Feature: Patient Appointment Booking

  As a patient
  I want to book a doctor appointment
  So that I can receive medical services

  Background:
    Given the API is running
    And the patient is authenticated

  Scenario: Successfully book an available appointment
    Given the doctor has an available published slot
    When the patient books the selected slot
    Then the API response status should be 201
    And the appointment status should be "booked"

  Scenario: Prevent duplicate appointment booking
    Given the doctor has an available published slot
    And the selected slot is already booked
    When the patient tries to book the same slot again
    Then the API response status should be 409
