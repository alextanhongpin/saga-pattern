```go
package main

import (
	"errors"
	"fmt"
)

func main() {
	fmt.Println("Hello, playground")
}

type Saga struct {
	Status string
	Steps  map[string]Step
}

func (s *Saga) GetStep(name string) (Step, bool) {
	step, ok := s.Steps[name]
	return step, ok
}

type Step struct {
	Name    string
	Payload interface{}
	Status  string
}

func createBooking(saga *Saga) (interface{}, error) {
	step, ok := saga.GetStep("create_booking")
	if !ok {
		return nil, errors.New("invalid step")
	}
	if step.Status == "success" {
		return step.Payload, nil
	}
	if step.Status != "pending" {
		return nil, errors.New("invalid status")
	}
	return publishCreateBookingCommand()
}

func publishCreateBookingCommand() (interface{}, error) {
	return nil, nil
}

type BookingCreated struct {
	ID string
}

func onBookingCreated(event BookingCreated) (*Saga, error) {
	saga := loadSaga(event.ID)
	step, ok := saga.GetStep("create_booking")
	if !ok {
		return nil, errors.New("step not found")
	}
	if step.Status == "success" {
		return saga, nil
	}
	if step.Status != "pending" {
		return nil, errors.New("invalid status transition")
	}
	step.Status = "success"
	step.Payload = event
	if err := saga.UpdateStep(step); err != nil {
		return nil, err
	}
	return saga, nil
}

func main() {
	// Event main loop.
	for {
		evt := <-evtCh
		switch e := evt.(type) {
		case BookingCreated:
			saga, err := onBookingCreated(e)
			if err != nil {
				// Log error and continue
			}
			ch <- saga
		}
	}

	// Workflow main loop.
	for {
		saga := <-ch
		if saga.Status == "done" {
			return
		}
		if saga.Status == "compensating" {
			status := saga.CheckStatus()
			if status == "compensated" {
				saga.Status = "done"
				saga.Save()
				continue
			}
		}
		if err := bookingFlow(saga); err != nil {
			return err
		}
	}

}

func bookingFlow(saga *Saga) {
	booking, err := createBooking(saga)
	if err != nil {
		return err
	}
	if booking == nil {
		// Not ready.
		return nil
	}

	payment, err := createPayment()
	if err != nil {
		return err
	}
	if payment == nil {
		return nil
	}

	booking, err := confirmBooking()
	if err != nil {
		return nil
	}
	if booking == nil {
		return nil
	}
	return done()
}

```
