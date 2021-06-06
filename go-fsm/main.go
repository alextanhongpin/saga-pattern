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

func NewCreateBookingStep(step *Step) *Step {
	if step.Name != "create-booking" {
		return step
	}

	// Each step has it's own state machine that updates the status of the step.
	// Each step starts with the status pending.
	// In this example, when the booking is created, the status will change from
	// pending to success.
	// However, if the next step fails, then upon successful rollback, the status
	// will change from success to compensated.
	step.FSM = fsm.NewFSM(
		step.Status.String(),
		fsm.Events{
			{Name: "booking_created", Src: []string{StepStatusPending.String()}, Dst: StepStatusSuccess.String()},
			{Name: "booking_cancelled", Src: []string{StepStatusSuccess.String()}, Dst: StepStatusCompensated.String()},
		},
		fsm.Callbacks{
			"enter_state": func(e *fsm.Event) {
				status := StepStatus(e.Dst)
				if !status.Valid() {
					log.Fatalln("invalid step status", status)
				}
				step.Status = status
			},
		},
	)
	return step
}

func NewCreatePaymentStep(step *Step) *Step {
	if step.Name != "create-payment" {
		return step
	}

	step.FSM = fsm.NewFSM(
		step.Status.String(),
		fsm.Events{
			{Name: "payment_created", Src: []string{StepStatusPending.String()}, Dst: StepStatusSuccess.String()},
			{Name: "payment_expired", Src: []string{StepStatusPending.String()}, Dst: StepStatusFailed.String()},
			{Name: "payment_failed", Src: []string{StepStatusPending.String()}, Dst: StepStatusFailed.String()},
			{Name: "payment_refunded", Src: []string{StepStatusSuccess.String()}, Dst: StepStatusCompensated.String()},
		},
		fsm.Callbacks{
			"enter_state": func(e *fsm.Event) {
				// On entering any state, update the status of the step.
				status := StepStatus(e.Dst)
				if !status.Valid() {
					log.Fatalln("invalid step status", status)
				}
				step.Status = status
			},
		},
	)
	return step
}

func NewConfirmBookingStep(step *Step) *Step {
	if step.Name != "confirm-booking" {
		return step
	}

	step.FSM = fsm.NewFSM(
		step.Status.String(),
		fsm.Events{
			{Name: "booking_confirmed", Src: []string{StepStatusPending.String()}, Dst: StepStatusSuccess.String()},
			{Name: "booking_failed", Src: []string{StepStatusPending.String()}, Dst: StepStatusFailed.String()},
			{Name: "booking_rejected", Src: []string{StepStatusSuccess.String()}, Dst: StepStatusFailed.String()},
		},
		fsm.Callbacks{
			"enter_state": func(e *fsm.Event) {
				status := StepStatus(e.Dst)
				if !status.Valid() {
					log.Fatalln("invalid step status", status)
				}
				step.Status = status
			},
		},
	)
	return step
}

type Saga struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	CurrentStep string   `json:"currentStep"`
	Payload     []byte   `json:"payload"`
	Steps       []*Step  `json:"steps"`
	Version     int      `json:"version"`
	FSM         *fsm.FSM `json:"-"`
}

func NewBookingSaga(id string, callbacks fsm.Callbacks) *Saga {
	saga := &Saga{
		ID:          id,
		Name:        "create-booking-saga",
		Version:     1,
		CurrentStep: "start",
		Steps: []*Step{
			&Step{Name: "create-booking", Status: StepStatusPending},
			&Step{Name: "create-payment", Status: StepStatusPending},
			&Step{Name: "confirm-booking", Status: StepStatusPending},
		},
	}
	saga = WithStateMachine(saga)
	saga = WithCallbacks(saga, callbacks)
	if err := saga.FSM.Event("started"); err != nil {
		panic(err)
	}
	return saga
}

// WithStateMachine allows the FSM to be attached to each step, especially
// after deserializing the state.
func WithStateMachine(saga *Saga) *Saga {
	for i, step := range saga.Steps {
		saga.Steps[i] = NewCreateBookingStep(step)
		saga.Steps[i] = NewCreatePaymentStep(step)
		saga.Steps[i] = NewConfirmBookingStep(step)
	}
	return saga
}

func WithCallbacks(saga *Saga, additionalCallbacks fsm.Callbacks) *Saga {
	callbacks := fsm.Callbacks{
		"enter_state": func(e *fsm.Event) {
			saga.CurrentStep = e.Dst
		},
	}
	for k, v := range additionalCallbacks {
		_, exists := callbacks[k]
		if exists {
			log.Fatalln("cannot overwrite existing callback", k)
		}
		callbacks[k] = v
	}
	// We introduce a state machine to control the step transitions whenever a
	// new event occurred.
	saga.FSM = fsm.NewFSM(
		saga.CurrentStep,
		fsm.Events{
			// Events are mapped to commands here.
			{Name: "started", Src: []string{"start"}, Dst: "create-booking"},
			{Name: "booking_created", Src: []string{"create-booking"}, Dst: "create-payment"},
			{Name: "payment_created", Src: []string{"create-payment"}, Dst: "confirm-booking"},
			{Name: "booking_confirmed", Src: []string{"confirm-booking"}, Dst: "end"},
			{Name: "reversed", Src: []string{"end"}, Dst: "reject-booking"},
			{Name: "booking_rejected", Src: []string{"reject-booking"}, Dst: "refund-payment"},
			{Name: "payment_refunded", Src: []string{"refund-payment"}, Dst: "cancel-booking"},
			{Name: "booking_cancelled", Src: []string{"cancel-booking"}, Dst: "compensated"},
		},
		callbacks,
	)
	return saga
}

func (s *Saga) On(event string) error {
	var match bool
	for _, step := range s.Steps {
		if step.FSM.Can(event) {
			if err := step.FSM.Event(event); err != nil {
				return err
			}
			match = true
		}
	}

	if s.FSM.Can(event) {
		if err := s.FSM.Event(event); err != nil {
			return err
		}
		match = true
	}
	if match {
		return nil
	}
	return fmt.Errorf("invalid event: %s", event)
}

func (s *Saga) GetStep(name string) (*Step, error) {
	for _, step := range s.Steps {
		if step.Name == name {
			return step, nil
		}
	}
	return nil, errors.New("not found")
}

func (s *Saga) Status() SagaStatus {
	var compensated int
	for i, step := range s.Steps {
		if step.Status == StepStatusSuccess {
			if i == len(s.Steps)-1 {
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
