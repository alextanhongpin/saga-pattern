package main

import (
	"errors"
	"fmt"
	"log"
)

var ErrNoop = errors.New("no-op")

// For forward step
// - precondition: step key does not exists
// - start the operation and upon completion, set the key to false
// - saga is completed when the last forward step is completed

// For backward step
// - precondition: step key is true
// - For all the true keys in the map, undo the operation and set the key to false

// On Event
// success event: set the step to true
// failed event: delete the key and set the status to compensating
// last success event: set the step to true, and set status to completed
// last compensate event: delete the step, and set status to compensated

func main() {
	saga := NewSaga()

	stepFn := func(step string, fn func() error) error {
		// Ensure idempotent.
		if saga.CanStart(step) {
			return nil
		}
		fmt.Println("executing", step)
		// Do stuff here
		if err := fn(); err != nil {
			return err
		}

		// Mark step as started.
		if err := saga.Start(step); err != nil {
			return err
		}
		return ErrNoop
	}
	undoFn := func(step string, fn func() error) error {
		// Ensure idempotent.
		if !saga.CanUndo(step) {
			return nil
		}
		fmt.Println("undoing", step)
		// Do stuff here
		if err := fn(); err != nil {
			return err
		}

		// Remove undone steps.
		if err := saga.Undo(step); err != nil {
			return err
		}
		return ErrNoop
	}

	forward := func() (err error) {
		defer func() {
			if errors.Is(ErrNoop, err) {
				err = nil
			}
		}()
		// Chain your steps here.
		err = stepFn("create-booking", func() error {
			fmt.Println("creating booking...")
			return nil
		})
		if err != nil {
			return err
		}

		err = stepFn("create-payment", func() error {
			fmt.Println("creating payment...")
			return nil
		})
		if err != nil {
			return err
		}
		err = stepFn("confirm-booking", func() error {
			fmt.Println("confirming booking...")
			return nil
		})
		if err != nil {
			return err
		}
		return nil
	}

	backward := func() (err error) {
		defer func() {
			if errors.Is(ErrNoop, err) {
				err = nil
			}
		}()
		err = undoFn("create-booking", func() error {
			fmt.Println("cancelling booking...")
			return nil
		})
		if err != nil {
			return err
		}

		err = undoFn("create-payment", func() error {
			fmt.Println("refunding payment...")
			return nil
		})
		if err != nil {
			return err
		}
		return nil
	}

	handleEvent := func(event string) {
		fmt.Println("=> handling", event)
		switch event {
		case "booking-created":
			saga.Complete("create-booking")
		case "payment-created":
			saga.Complete("create-payment")
		case "booking-confirmed":
			saga.Complete("confirm-booking")
			saga.SetStatus("success") // Last forward event.
		case "booking-failed":
			saga.SetStatus("compensating")
		case "payment-failed":
			saga.SetStatus("compensating")
		case "booking-rejected":
			saga.SetStatus("compensating")
			saga.Remove("confirm-booking")
		case "payment-refunded":
			saga.SetStatus("compensating")
			saga.Remove("create-payment")
		case "booking-cancelled":
			saga.SetStatus("compensating")
			saga.Remove("create-booking")
		default:
			log.Fatalln("unhandled event", event)
		}

		saga.SyncStatus()

		if saga.IsCompleted() {
			fmt.Println("done")
		} else if saga.IsPending() {
			if err := forward(); err != nil {
				fmt.Println("error in forward step", err)
			}
		} else if saga.IsCompensating() {
			if err := backward(); err != nil {
				fmt.Println("error in backward step", err)
			}
		}
		fmt.Println("")
	}
	handleEvent("booking-created")
	handleEvent("payment-created")

	// Failed.
	handleEvent("booking-rejected")
	handleEvent("booking-cancelled")
	handleEvent("payment-refunded")

}

type Saga struct {
	status string
	steps  map[string]bool
}

func NewSaga() *Saga {
	return &Saga{
		status: "pending",
		steps:  make(map[string]bool),
	}
}

func (s *Saga) Exists(step string) bool {
	_, exists := s.steps[step]
	return exists
}

func (s *Saga) SetStatus(status string) {
	s.status = status
}

func (s *Saga) CheckComplete(step string) bool {
	completed, _ := s.steps[step]
	return completed
}

// Syncs the status of completion. For forward steps, the last step of the saga will mark the saga as completed.
// However, for backward steps, compensation can happen parallel, and in any order.
// So we treated the saga as fully compensated once all the events that indicates the rollback is done has been received.
func (s *Saga) SyncStatus() {
	if s.status == "compensating" && len(s.steps) == 0 {
		s.SetStatus("compensated")
	}
}

func (s *Saga) IsPending() bool {
	return s.status == "pending"
}

func (s *Saga) IsCompleted() bool {
	return s.status == "success" || s.status == "compensated"
}

func (s *Saga) IsCompensating() bool {
	return s.status == "compensating"
}

func (s *Saga) CanStart(step string) bool {
	return !s.Exists(step)
}

func (s *Saga) Start(step string) error {
	if !s.CanStart(step) {
		return errors.New("step completed")
	}
	s.steps[step] = false
	return nil
}

func (s *Saga) Complete(step string) error {
	if s.CheckComplete(step) {
		return errors.New("step completed")
	}
	s.steps[step] = true
	return nil
}

func (s *Saga) CanUndo(step string) bool {
	return s.CheckComplete(step)
}

func (s *Saga) Undo(step string) error {
	if !s.CanUndo(step) {
		return errors.New("step reversed")
	}
	s.steps[step] = false
	return nil
}
func (s *Saga) Remove(step string) error {
	delete(s.steps, step)
	return nil
}
