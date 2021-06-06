package main

import (
	"testing"

	"github.com/looplab/fsm"
	"github.com/stretchr/testify/assert"
)

func TestOrchestratorFlow(t *testing.T) {
	// Given a new orchestrator.

	var createPayment, confirmBooking, refundPayment, cancelBooking, sagaEnd bool
	eventHandlers := fsm.Callbacks{
		"booking_created": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			createPayment = true
		},
		"payment_created": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			confirmBooking = true
		},
		"booking_confirmed": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			sagaEnd = true
		},
		"booking_rejected": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			refundPayment = true
		},
		"payment_refunded": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			cancelBooking = true
		},
		"booking_cancelled": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			sagaEnd = true
		},
	}
	o := NewBookingSaga("1", eventHandlers)

	// When the booking is created.
	err := o.On("booking_created")

	assert := assert.New(t)
	assert.Nil(err)

	// Then the step is completed.
	step, err := o.GetStep("create-booking")
	assert.Nil(err)
	assert.Equal(StepStatusSuccess, step.Status)

	// And the create payment command is invoked.
	assert.True(createPayment)

	// When the payment is created.
	err = o.On("payment_created")
	assert.Nil(err)

	// Then the step is completed.
	step, err = o.GetStep("create-payment")
	assert.Nil(err)
	assert.Equal(StepStatusSuccess, step.Status)

	// And the confirm booking command is invoked.
	assert.True(confirmBooking)

	// When the booking is confirmed.
	err = o.On("booking_confirmed")
	assert.Nil(err)

	// Then the step is completed.
	step, err = o.GetStep("confirm-booking")
	assert.Nil(err)
	assert.Equal(StepStatusSuccess, step.Status)

	// And the saga is completed.
	assert.True(sagaEnd)

	// And the saga is done.
	assert.Equal(SagaStatusDone, o.Status())

	// When booking rejected.
	err = o.On("booking_rejected")
	assert.Nil(err)

	// The the step is marked as failed.
	step, err = o.GetStep("confirm-booking")
	assert.Nil(err)
	assert.Equal(StepStatusFailed, step.Status)

	// And the refund payment command is invoked.
	assert.True(refundPayment)

	// And the saga is compensating.
	assert.Equal(SagaStatusCompensating, o.Status())

	// When payment refunded.
	err = o.On("payment_refunded")
	assert.Nil(err)

	// The the step is marked as compensated.
	step, err = o.GetStep("create-payment")
	assert.Nil(err)
	assert.Equal(StepStatusCompensated, step.Status)

	// And the cancel booking command is invoked.
	assert.True(cancelBooking)

	// And the saga is compensating.
	assert.Equal(SagaStatusCompensating, o.Status())

	// When booking cancelled.
	err = o.On("booking_cancelled")
	assert.Nil(err)

	// The the step is marked as compensated.
	step, err = o.GetStep("create-booking")
	assert.Nil(err)
	assert.Equal(StepStatusCompensated, step.Status)

	// And the saga ends.
	assert.True(sagaEnd)

	// And the saga is done.
	assert.Equal(SagaStatusDone, o.Status())
}
