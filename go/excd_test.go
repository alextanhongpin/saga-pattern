package main

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBookingFlow(t *testing.T) {
	rep := NewInMemoryStore()
	sec := NewExecutionCoordinator(rep)
	ctx := context.Background()

	t.Run("step create booking", func(t *testing.T) {
		// Given that the booking is created.
		sg, err := sec.onBookingCreated(ctx, BookingCreated{
			ID: "1",
		})
		assert := assert.New(t)
		assert.Nil(err)

		saga, err := rep.FindSaga(ctx, sg.ID)
		assert.Nil(err)

		// When checking the step status,
		step, err := saga.GetStep("create-booking")
		assert.Nil(err)

		// Then the status should be `success`.
		assert.Equal("success", step.Status)

		// And the response payload should not be empty.
		assert.NotNil(step.ResponsePayload)

		// And the saga status should be `pending`.
		assert.Equal("pending", saga.CheckStatus())

		// And the next step should be executed.
		err = sec.BookingFlow(ctx, saga)
		assert.Nil(err)
	})

	t.Run("step create payment", func(t *testing.T) {
		sg, err := sec.onPaymentCreated(ctx, PaymentCreated{
			ID: "1",
		})
		assert := assert.New(t)
		assert.Nil(err)

		saga, err := rep.FindSaga(ctx, sg.ID)
		assert.Nil(err)

		step, err := saga.GetStep("create-payment")
		assert.Nil(err)

		// Then the status should be `success`.
		assert.Equal("success", step.Status)

		// And the response payload should not be empty.
		assert.NotNil(step.ResponsePayload)

		// And the saga status should be `pending`.
		assert.Equal("pending", saga.CheckStatus())

		// And the next step should be executed.
		err = sec.BookingFlow(ctx, saga)
		assert.Nil(err)
	})

	t.Run("step confirm booking", func(t *testing.T) {
		sg, err := sec.onBookingConfirmed(ctx, BookingConfirmed{
			ID: "1",
		})
		assert := assert.New(t)
		assert.Nil(err)

		saga, err := rep.FindSaga(ctx, sg.ID)
		assert.Nil(err)

		step, err := saga.GetStep("confirm-booking")
		assert.Nil(err)

		// Then the status should be `success`.
		assert.Equal("success", step.Status)

		// And the response payload should not be empty.
		assert.NotNil(step.ResponsePayload)

		// And the saga status should be `done`.
		assert.Equal("done", saga.CheckStatus())

		// And the next step should be executed.
		err = sec.BookingFlow(ctx, saga)
		assert.Nil(err)
	})
}

func TestCompensation(t *testing.T) {
	rep := NewInMemoryStore()
	saga := &Saga{
		ID:      "1",
		Name:    "booking-saga",
		Version: 1,
		Steps: []Step{
			{Name: "create-booking", Status: "success"},
			{Name: "create-payment", Status: "success"},
			{Name: "confirm-booking", Status: "success"},
		},
	}
	ctx := context.Background()

	_, err := rep.UpdateSaga(ctx, saga)
	require.Nil(t, err)

	sec := NewExecutionCoordinator(rep)

	t.Run("step reject booking", func(t *testing.T) {
		// Given that the booking is rejected.
		sg, err := sec.onBookingRejected(ctx, BookingRejected{
			ID: "1",
		})
		assert := assert.New(t)
		assert.Nil(err)

		saga, err := rep.FindSaga(ctx, sg.ID)
		assert.Nil(err)

		// When checking the step status,
		step, err := saga.GetStep("confirm-booking")
		assert.Nil(err)

		// Then the status should be `success`.
		assert.Equal("failed", step.Status)

		// And the response payload should not be empty.
		assert.NotNil(step.ResponsePayload)

		// And the saga status should be `pending`.
		assert.Equal("compensating", saga.CheckStatus())

		// And the next step should be executed.
		err = sec.CompensationFlow(ctx, saga)
		assert.Nil(err)
	})

	t.Run("step refund payment", func(t *testing.T) {
		sg, err := sec.onPaymentRefunded(ctx, PaymentRefunded{
			ID: "1",
		})
		assert := assert.New(t)
		assert.Nil(err)

		saga, err := rep.FindSaga(ctx, sg.ID)
		assert.Nil(err)

		step, err := saga.GetStep("create-payment")
		assert.Nil(err)

		// Then the status should be `success`.
		assert.Equal("compensated", step.Status)

		// And the response payload should not be empty.
		assert.NotNil(step.ResponsePayload)

		// And the saga status should be `pending`.
		assert.Equal("compensating", saga.CheckStatus())

		// And the next step should be executed.
		err = sec.CompensationFlow(ctx, saga)
		assert.Nil(err)
	})

	t.Run("step booking cancelled", func(t *testing.T) {
		// Given that the Saga Execution Coordinator receives the booking cancelled event.
		sg, err := sec.onBookingCancelled(ctx, BookingCancelled{
			ID: "1",
		})
		assert := assert.New(t)
		assert.Nil(err)

		saga, err := rep.FindSaga(ctx, sg.ID)
		assert.Nil(err)

		step, err := saga.GetStep("create-booking")
		assert.Nil(err)

		// Then the status should be `success`.
		assert.Equal("compensated", step.Status)

		// And the response payload should not be empty.
		assert.NotNil(step.ResponsePayload)

		// And the saga status should be `done`.
		assert.Equal("done", saga.CheckStatus())

		// And the next step should be executed.
		err = sec.CompensationFlow(ctx, saga)
		assert.Nil(err)
	})
}
