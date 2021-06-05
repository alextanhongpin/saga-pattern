package main

import (
	"errors"
	"fmt"

	"github.com/looplab/fsm"
)

type Step struct {
	Name   string
	Status string
	fsm    *fsm.FSM
}

func NewCreateBookingStep(o *Orchestrator) *Step {
	step := &Step{
		Name:   "create-booking",
		Status: "pending",
	}
	step.fsm = fsm.NewFSM(
		"pending",
		fsm.Events{
			{Name: "booking_created", Src: []string{"pending"}, Dst: "success"},
			{Name: "booking_cancelled", Src: []string{"success"}, Dst: "compensated"},
		},
		fsm.Callbacks{
			"enter_state": func(e *fsm.Event) {
				step.Status = e.Dst
			},
			"leave_booking_created": func(e *fsm.Event) {
				if err := o.CreatePayment(); err != nil {
					e.Cancel(err)
				}
			},
		},
	)
	return step
}

func NewCreatePaymentStep(o *Orchestrator) *Step {
	step := &Step{
		Name:   "create-payment",
		Status: "pending",
	}
	step.fsm = fsm.NewFSM(
		"pending",
		fsm.Events{
			{Name: "payment_created", Src: []string{"pending"}, Dst: "success"},
			{Name: "payment_expired", Src: []string{"pending"}, Dst: "failed"},
			{Name: "payment_failed", Src: []string{"pending"}, Dst: "failed"},
			{Name: "payment_refunded", Src: []string{"success"}, Dst: "compensated"},
		},
		fsm.Callbacks{
			"enter_state": func(e *fsm.Event) {
				step.Status = e.Dst
			},
			"leave_state": func(e *fsm.Event) {
				switch e.Event {
				case "payment_created":
					// Next.
					if err := o.ConfirmBooking(); err != nil {
						e.Cancel(err)
					}
				default:
					// Prev.
					if err := o.CancelBooking(); err != nil {
						e.Cancel(err)
					}
				}
			},
		},
	)
	return step
}

func NewConfirmBookingStep(o *Orchestrator) *Step {
	step := &Step{
		Name:   "confirm-booking",
		Status: "pending",
	}
	step.fsm = fsm.NewFSM(
		"pending",
		fsm.Events{
			{Name: "booking_confirmed", Src: []string{"pending"}, Dst: "success"},
			{Name: "booking_failed", Src: []string{"pending"}, Dst: "failed"},
			{Name: "booking_rejected", Src: []string{"success"}, Dst: "failed"},
		},
		fsm.Callbacks{
			"enter_state": func(e *fsm.Event) {
				step.Status = e.Dst
			},
			"leave_state": func(e *fsm.Event) {
				if e.Event == "booking_confirmed" {
					return
				}
				if err := o.RefundPayment(); err != nil {
					e.Cancel(err)
				}
			},
		},
	)
	return step
}

type Orchestrator struct {
	ID      string
	Name    string
	Payload []byte
	Steps   []*Step
	Version int
}

func NewBookingOrchestrator(id string) *Orchestrator {
	o := &Orchestrator{
		ID:      id,
		Name:    "create-booking-saga",
		Version: 1,
	}
	o.Steps = append(o.Steps,
		NewCreateBookingStep(o),
		NewCreatePaymentStep(o),
		NewConfirmBookingStep(o),
	)
	return o
}

func (o *Orchestrator) CancelBooking() error {
	return nil
}

func (o *Orchestrator) CreatePayment() error {
	// Prepare create payment request.
	return nil
}

func (o *Orchestrator) RefundPayment() error {
	return nil
}

func (o *Orchestrator) ConfirmBooking() error {
	return nil
}

func (o *Orchestrator) RejectBooking() error {
	return nil
}

func (o *Orchestrator) On(event string) error {
	for _, step := range o.Steps {
		if step.fsm.Can(event) {
			if err := step.fsm.Event(event); err != nil {
				return err
			}
			return nil
		}
	}
	return fmt.Errorf("invalid event: %s", event)
}

func (o *Orchestrator) GetStep(name string) (*Step, error) {
	for _, step := range o.Steps {
		if step.Name == name {
			return step, nil
		}
	}
	return nil, errors.New("not found")
}

func (o *Orchestrator) Status() string {
	for i, step := range o.Steps {
		if step.Status == "success" {
			if i == len(o.Steps)-1 {
				return "done"
			}
		}
		if step.Status == "failed" {
			if i == 0 {
				return "done"
			}
			return "compensating"
		}
		if step.Status == "compensated" {
			if i == 0 {
				return "done"
			}
			return "compensating"
		}
	}
	return "pending"
}
