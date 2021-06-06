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
		"create-payment": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			createPayment = true
		},
		"confirm-booking": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			confirmBooking = true
		},
		"end": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			sagaEnd = true
		},
		"refund-payment": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			refundPayment = true
		},
		"cancel-booking": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			cancelBooking = true
		},
		"compensated": func(e *fsm.Event) {
			t.Logf("%s<%s,%s>\n", e.Event, e.Src, e.Dst)
			sagaEnd = true
		},
	}
	saga := NewBookingSaga("1", eventHandlers)

	// When the booking is created.
	err := saga.On("booking_created")

	assert := assert.New(t)
	assert.Nil(err)

	// Then the step is completed.
	step, err := saga.GetStep("create-booking")
	assert.Nil(err)
	assert.Equal(StepStatusSuccess, step.Status)

	// And the create payment command is invoked.
	assert.True(createPayment)

	// When the payment is created.
	err = saga.On("payment_created")
	assert.Nil(err)

	// Then the step is completed.
	step, err = saga.GetStep("create-payment")
	assert.Nil(err)
	assert.Equal(StepStatusSuccess, step.Status)

	// And the confirm booking command is invoked.
	assert.True(confirmBooking)

	// When the booking is confirmed.
	err = saga.On("booking_confirmed")
	assert.Nil(err)

	// Then the step is completed.
	step, err = saga.GetStep("confirm-booking")
	assert.Nil(err)
	assert.Equal(StepStatusSuccess, step.Status)

	// And the saga is completed.
	assert.True(sagaEnd)

	// And the saga is done.
	assert.Equal(SagaStatusDone, saga.Status())

	assert.Nil(saga.On("reversed"))

	// When booking rejected.
	err = saga.On("booking_rejected")
	assert.Nil(err)

	// The the step is marked as failed.
	step, err = saga.GetStep("confirm-booking")
	assert.Nil(err)
	assert.Equal(StepStatusFailed, step.Status)

	// And the refund payment command is invoked.
	assert.True(refundPayment)

	// And the saga is compensating.
	assert.Equal(SagaStatusCompensating, saga.Status())

	// When payment refunded.
	err = saga.On("payment_refunded")
	assert.Nil(err)

	// The the step is marked as compensated.
	step, err = saga.GetStep("create-payment")
	assert.Nil(err)
	assert.Equal(StepStatusCompensated, step.Status)

	// And the cancel booking command is invoked.
	assert.True(cancelBooking)

	// And the saga is compensating.
	assert.Equal(SagaStatusCompensating, saga.Status())

	// When booking cancelled.
	err = saga.On("booking_cancelled")
	assert.Nil(err)

	// The the step is marked as compensated.
	step, err = saga.GetStep("create-booking")
	assert.Nil(err)
	assert.Equal(StepStatusCompensated, step.Status)

	// And the saga ends.
	assert.True(sagaEnd)

	// And the saga is done.
	assert.Equal(SagaStatusDone, saga.Status())
}
