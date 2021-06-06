package main

import (
	"errors"
	"fmt"
	"log"

	"github.com/looplab/fsm"
)

type StepStatus string

const (
	StepStatusPending      StepStatus = "pending"
	StepStatusSuccess      StepStatus = "success"
	StepStatusFailed       StepStatus = "failed"
	StepStatusCompensating StepStatus = "compensating"
	StepStatusCompensated  StepStatus = "compensated"
)

func (s StepStatus) Valid() bool {
	switch s {
	case
		StepStatusPending,
		StepStatusSuccess,
		StepStatusFailed,
		StepStatusCompensating,
		StepStatusCompensated:
		return true
	default:
		return false
	}
}

func (s StepStatus) String() string {
	return string(s)
}

type SagaStatus string

const (
	SagaStatusPending      SagaStatus = "pending"
	SagaStatusSuccess      SagaStatus = "success"
	SagaStatusCompensating SagaStatus = "compensating"
	SagaStatusDone         SagaStatus = "done"
)

func (s SagaStatus) Valid() bool {
	switch s {
	case
		SagaStatusPending,
		SagaStatusSuccess,
		SagaStatusCompensating,
		SagaStatusDone:
		return true
	default:
		return false
	}
}

type Step struct {
	Name   string     `json:"name"`
	Status StepStatus `json:"status"`
	FSM    *fsm.FSM   `json:"-"`
}

func NewCreateBookingStep(step *Step, additionalCallbacks fsm.Callbacks) *Step {
	if step.Name != "create-booking" {
		return step
	}

	callbacks := fsm.Callbacks{
		"enter_state": func(e *fsm.Event) {
			status := StepStatus(e.Dst)
			if !status.Valid() {
				log.Fatalln("invalid step status", status)
			}
			step.Status = status
		},
	}

	for k, v := range additionalCallbacks {
		_, exists := callbacks[k]
		if exists {
			panic("cannot override existing callback")
		}
		callbacks[k] = v
	}

	step.FSM = fsm.NewFSM(
		StepStatusPending.String(),
		fsm.Events{
			{Name: "booking_created", Src: []string{StepStatusPending.String()}, Dst: StepStatusSuccess.String()},
			{Name: "booking_cancelled", Src: []string{StepStatusSuccess.String()}, Dst: StepStatusCompensated.String()},
		},
		callbacks,
	)
	return step
}

func NewCreatePaymentStep(step *Step, additionalCallbacks fsm.Callbacks) *Step {
	if step.Name != "create-payment" {
		return step
	}
	callbacks := fsm.Callbacks{
		"enter_state": func(e *fsm.Event) {
			// On entering any state, update the status of the step.
			status := StepStatus(e.Dst)
			if !status.Valid() {
				log.Fatalln("invalid step status", status)
			}
			step.Status = status
		},
	}

	for k, v := range additionalCallbacks {
		_, exists := callbacks[k]
		if exists {
			panic("cannot override existing callbacks")
		}
		callbacks[k] = v
	}
	step.FSM = fsm.NewFSM(
		StepStatusPending.String(),
		fsm.Events{
			{Name: "payment_created", Src: []string{StepStatusPending.String()}, Dst: StepStatusSuccess.String()},
			{Name: "payment_expired", Src: []string{StepStatusPending.String()}, Dst: StepStatusFailed.String()},
			{Name: "payment_failed", Src: []string{StepStatusPending.String()}, Dst: StepStatusFailed.String()},
			{Name: "payment_refunded", Src: []string{StepStatusSuccess.String()}, Dst: StepStatusCompensated.String()},
		},
		callbacks,
	)
	return step
}

func NewConfirmBookingStep(step *Step, additionalCallbacks fsm.Callbacks) *Step {
	if step.Name != "confirm-booking" {
		return step
	}

	callbacks := fsm.Callbacks{
		"enter_state": func(e *fsm.Event) {
			status := StepStatus(e.Dst)
			if !status.Valid() {
				log.Fatalln("invalid step status", status)
			}
			step.Status = status
		},
	}

	for k, v := range additionalCallbacks {
		_, exists := callbacks[k]
		if exists {
			panic("cannot override existing callbacks")
		}
		callbacks[k] = v
	}

	step.FSM = fsm.NewFSM(
		StepStatusPending.String(),
		fsm.Events{
			{Name: "booking_confirmed", Src: []string{StepStatusPending.String()}, Dst: StepStatusSuccess.String()},
			{Name: "booking_failed", Src: []string{StepStatusPending.String()}, Dst: StepStatusFailed.String()},
			{Name: "booking_rejected", Src: []string{StepStatusSuccess.String()}, Dst: StepStatusFailed.String()},
		},
		callbacks,
	)
	return step
}

type Saga struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Payload   []byte        `json:"payload"`
	Steps     []*Step       `json:"steps"`
	Version   int           `json:"version"`
	Callbacks fsm.Callbacks `json:"-"`
}

func NewBookingSaga(id string, callbacks fsm.Callbacks) *Saga {
	saga := &Saga{
		ID:      id,
		Name:    "create-booking-saga",
		Version: 1,
		Steps: []*Step{
			&Step{Name: "create-booking", Status: StepStatusPending},
			&Step{Name: "create-payment", Status: StepStatusPending},
			&Step{Name: "confirm-booking", Status: StepStatusPending},
		},
	}
	return WithStateMachine(saga, callbacks)
}

// WithStateMachine allows the FSM to be attached to each step, especially
// after deserializing the state.
func WithStateMachine(saga *Saga, callbacks fsm.Callbacks) *Saga {
	for i, step := range saga.Steps {
		saga.Steps[i] = NewCreateBookingStep(step, callbacks)
		saga.Steps[i] = NewCreatePaymentStep(step, callbacks)
		saga.Steps[i] = NewConfirmBookingStep(step, callbacks)
	}
	return saga
}

func (o *Saga) On(event string) error {
	var match bool
	for _, step := range o.Steps {
		if step.FSM.Can(event) {
			if err := step.FSM.Event(event); err != nil {
				return err
			}
			match = true
		}
	}
	if match {
		return nil
	}
	return fmt.Errorf("invalid event: %s", event)
}

func (o *Saga) GetStep(name string) (*Step, error) {
	for _, step := range o.Steps {
		if step.Name == name {
			return step, nil
		}
	}
	return nil, errors.New("not found")
}

func (o *Saga) Status() SagaStatus {
	var compensated int
	for i, step := range o.Steps {
		if step.Status == StepStatusSuccess {
			if i == len(o.Steps)-1 {
				return SagaStatusDone
			}
		}
		if step.Status == StepStatusCompensated {
			compensated++
		}
		if step.Status == StepStatusFailed {
			if i == compensated {
				return SagaStatusDone
			}
			return SagaStatusCompensating
		}
	}
	return SagaStatusPending
}
