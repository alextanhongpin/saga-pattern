// You can edit this code!
// Click here and start typing.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"play.ground/saga"
)

var count int

func noop(ctx context.Context) error {
	if count > 0 {
		return errors.New("bad request")
	}
	count++
	fmt.Println("doing work")
	return nil
}

func main() {
	s := saga.New("saga-1")
	s.AddStep(NewCreateBookingStep(noop), NewCancelBookingStep(noop))
	s.AddStep(NewMakePaymentStep(noop), NewRefundPaymentStep(noop))
	s.AddStep(NewConfirmOrderStep(noop), nil)
	s.AddStep(NewFullyTransactedStep(), NewFullyCompensatedStep())
	if err := s.Emit(context.Background(), "INIT"); err != nil {
		panic(err)
	}

	if err := s.Emit(context.Background(), "BOOKING_CREATED"); err != nil {
		print(s)
	}
	if err := s.Emit(context.Background(), "BOOKING_CANCELLED"); err != nil {
		print(s)
	}

	print(s)
}

func print(s any) {
	b, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
}

func NewCreateBookingStep(fn saga.Handler) *saga.Step {
	return &saga.Step{
		Name: "CreateBooking",
		When: []string{"INIT"},
		Then: "BOOKING_CREATED",
		Undo: false,
		Func: fn,
	}
}

func NewMakePaymentStep(fn saga.Handler) *saga.Step {
	return &saga.Step{
		Name: "MakePayment",
		When: []string{"BOOKING_CREATED"},
		Then: "PAYMENT_MADE",
		Undo: false,
		Func: fn,
	}
}

func NewConfirmOrderStep(fn saga.Handler) *saga.Step {
	return &saga.Step{
		Name: "ConfirmOrder",
		When: []string{"PAYMENT_MADE"},
		Then: "ORDER_CONFIRMED",
		Undo: false,
		Func: fn,
	}
}
func NewFullyTransactedStep() *saga.Step {
	return &saga.Step{
		Name: "Noop",
		When: []string{"ORDER_CONFIRMED"},
		Then: "DONE",
		Undo: false,
		Func: nil,
	}
}

func NewRefundPaymentStep(fn saga.Handler) *saga.Step {
	return &saga.Step{
		Name: "RefundPayment",
		When: []string{"ORDER_REJECTED"},
		Then: "PAYMENT_REFUNDED",
		Undo: true,
		Func: fn,
	}
}
func NewCancelBookingStep(fn saga.Handler) *saga.Step {
	return &saga.Step{
		Name: "CancelBooking",
		When: []string{"PAYMENT_REFUNDED"},
		Then: "BOOKING_CANCELLED",
		Undo: true,
		Func: fn,
	}
}

func NewFullyCompensatedStep() *saga.Step {
	return &saga.Step{
		Name: "Done",
		When: []string{"BOOKING_CANCELLED"},
		Then: "DONE",
		Undo: true,
		Func: nil,
	}
}
-- go.mod --
module play.ground
-- saga/saga.go --
package saga

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type Handler func(ctx context.Context) error

type Status string

var (
	StatusPending Status = "pending"
	StatusSuccess Status = "success"
	StatusFailed  Status = "failed"
)

func (s Status) IsPending() bool {
	return s == StatusPending
}

func (s Status) IsSuccess() bool {
	return s == StatusSuccess
}

func (s Status) IsFailed() bool {
	return s == StatusFailed
}
func (s Status) Valid() bool {
	switch s {
	case
		StatusPending,
		StatusSuccess,
		StatusFailed:
		return true
	default:
		return false
	}
}

type Step struct {
	Name string
	Func Handler `json:"-"`
	When []string
	Then string
	Undo bool
}

type StepEvent struct {
	Name      string
	Status    Status
	Undo      bool
	CreatedAt time.Time
}

type Saga struct {
	ID     string
	Name   string
	Steps  []Step
	Events []StepEvent
	steps  map[string]Step
}

func New(id string) *Saga {
	return &Saga{
		ID:    id,
		steps: make(map[string]Step),
	}
}

func (s *Saga) addStep(step Step) {
	// Step must be unique.
	_, ok := s.steps[step.Name]
	if ok {
		panic(fmt.Errorf("step with the name already exists: %s", step.Name))
	}
	s.steps[step.Name] = step
}

func (s *Saga) AddStep(tx *Step, cx *Step) {
	if tx != nil {
		if tx.Undo {
			panic("transaction cannot be undo")
		}
		s.addStep(*tx)
		s.Steps = append(s.Steps, *tx)
	}
	if cx != nil {
		if !cx.Undo {
			panic("compensation must be undo")
		}

		s.addStep(*cx)
		s.Steps = append(s.Steps, *cx)
	}

}

func (s *Saga) SetEvents(events []StepEvent) {
	s.Events = events
}

func (s *Saga) Emit(ctx context.Context, event string) error {
	var isUndo bool
	for _, evt := range s.Events {
		if evt.Name == event {
			return errors.New("duplicate event")
		}
		if (evt.Status.IsFailed() || evt.Undo) && !isUndo {
			isUndo = true
		}
	}

	var step Step
	for _, s := range s.Steps {
		for _, when := range s.When {
			if when == event {
				step = s
				break
			}
		}
	}

	fmt.Println("event", event, step, isUndo)
	if step.Undo != isUndo {
		panic("invalid step")
	}

	for _, step := range s.Steps {
		// Mark the previous event as completed.
		if step.Then == event {
			s.Events = append(s.Events, StepEvent{
				Name:   step.Name,
				Status: StatusSuccess,
				Undo:   step.Undo,
			})
			break
		}
	}
	s.Events = append(s.Events, StepEvent{
		Name:   step.Name,
		Status: StatusPending,
		Undo:   step.Undo,
	})
	if step.Func == nil {
		return nil
	}
	if err := step.Func(ctx); err != nil {
		s.Events = append(s.Events, StepEvent{
			Name:   step.Name,
			Status: StatusFailed,
			Undo:   step.Undo,
		})
		return err
	}
	return nil
}