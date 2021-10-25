Using interface to define the flow of saga.
```go
package main

import (
	"context"
)

func main() {

	// From message queue.
	evt := repo.PaymentReceived{}
	repo := NewBookingSagaRepository()
	if err := repo.Snapshot(evt); err != nil {
		panic(err)
	}

	saga := repo.Find(ctx, evt.CorrelationID)
	saga.sideEffects.receive = func(ctx context.Context) (Event, error) {
		return evt, nil
	}
	saga.sideEffects.publish = func(ctx context.Context, cmd Command) error {
		return repo.Save(ctx, cmd)
	}
	if err := Book(saga); err != nil {
		panic(err)
	}
}

func Book(saga *BookingSaga) error {
	if saga.Done() {
		return nil
	}
	if saga.Compensating() {
		return CompensateBookingSaga(saga)
	}
	return TransactBookingSaga(saga)
}

func TransactBookingSaga(ctx context.Context, flow interface{}) error {
	flow.BookHotel(ctx)
	flow.BookFlight(ctx)
	flow.BookCar(ctx)
	return flow.Err()
}

func CompensateBookingSaga(ctx context.Context, flow interface{}) error {
	flow.CancelCar(ctx)
	flow.CancelFlight(ctx)
	flow.CancelHotel(ctx)
	return flow.Err()
}

type BookingSagaRepository interface {
	// Find returns the booking saga in the ready-state.
	Find(ctx context.Context, correlationID string) (BookingSaga, error)
}

type BookingSaga struct {
	err   error
	state struct {
		correlationID string
		canBookHotel  bool
	}
	sideEffects struct {
		// Also responsible for persisting the events and commands as saga log.
		// Proxies them to saga repository.
		receive func(context.Context) (Event, error)
		publish func(context.Context, Command) error
	}
}

func (s *BookingSaga) BookHotel(ctx context.Context) {
	if s.err != nil {
		return
	}
	if !s.state.canBookHotel {
		return
	}

	evt, err := s.sideEffects.receive(ctx)
	if err != nil {
		s.err = err
		return
	}
	e, ok := evt.(PaymentReceived)
	if !ok {
		return
	}
	cmd := process(e)
	s.err = s.sideEffects.publish(ctx, cmd)
}
```
