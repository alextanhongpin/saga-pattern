package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOrchestratorFlow(t *testing.T) {
	// Given a new orchestrator.
	o := NewBookingOrchestrator("1")

	// When the booking is created.
	err := o.On("booking_created")

	assert := assert.New(t)
	assert.Nil(err)

	// Then the step is completed.
	step, err := o.GetStep("create-booking")
	assert.Nil(err)
	assert.Equal("success", step.Status)

	// When the payment is created.
	err = o.On("payment_created")
	assert.Nil(err)

	// Then the step is completed.
	step, err = o.GetStep("create-payment")
	assert.Nil(err)
	assert.Equal("success", step.Status)

	// When the booking is confirmed.
	err = o.On("booking_confirmed")
	assert.Nil(err)

	// Then the step is completed.
	step, err = o.GetStep("confirm-booking")
	assert.Nil(err)
	assert.Equal("success", step.Status)

	// And the saga is done.
	assert.Equal("done", o.Status())

	// When booking rejected.
	err = o.On("booking_rejected")
	assert.Nil(err)

	// The the step is marked as failed.
	step, err = o.GetStep("confirm-booking")
	assert.Nil(err)
	assert.Equal("failed", step.Status)

	// And the saga is compensating.
	assert.Equal("compensating", o.Status())

	// When payment refunded.
	err = o.On("payment_refunded")
	assert.Nil(err)

	// The the step is marked as compensated.
	step, err = o.GetStep("create-payment")
	assert.Nil(err)
	assert.Equal("compensated", step.Status)

	// And the saga is compensating.
	assert.Equal("compensating", o.Status())

	// When booking cancelled.
	err = o.On("booking_cancelled")
	assert.Nil(err)

	// The the step is marked as compensated.
	step, err = o.GetStep("create-booking")
	assert.Nil(err)
	assert.Equal("compensated", step.Status)

	// And the saga is done.
	assert.Equal("done", o.Status())
}
