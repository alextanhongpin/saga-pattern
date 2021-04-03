# Handling external calls

```go
package main

import (
	"context"
	"fmt"
)

// https://docs.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
https://vasters.com/archive/Sagas.html
https://blog.jonathanoliver.com/idempotency-patterns/
func main() {
	fmt.Println("Hello, playground")
}

// How to deal if they have many steps?
type BookingScheduler interface {
	BookFlight()
	BookHotel()
	CancelFlight()
	CancelHotel()
}

// PendingOperations are queried externally.
// PendingOperation()
// INSERT INTO table (id, external_id, state, complete_by) VALUES (1, 'order-xyz', 'pending', now() + interval '5 minute') ON CONFLICT DO NOTHING RETURNING id;
func (s *OrderScheduler) AtomicPhase(ctx context.Context, externalID string, hook func(ctx context.Context) error) error {
	updateLastRunAt()
	hook.Before(updateReqPayload())
	// BEGIN

	lockRow()
	// SELECT *
	// FROM table
	// WHERE id = 1 AND status = 'pending'
	// FOR UPDATE
	// SKIP LOCKED

	// SELECT pg_try_advisory_xact_lock(1, int('order-xyz'))
	if !getAdvisoryLock() {
		rollback()
	}
	res, err := fn(ctx, order)
	if err != nil {
		// UPDATE table SET status = 'failed' WHERE id = 1
		setStatusToFailed()
		hook.after(updateResPayload())
		commit()
		return
	}
	// UPDATE table SET status = 'success' WHERE id = 1
	// COMMIT
	setStatusToProcessed()
	hook.After(updateResPayload())
	commit()
}
```

## Scheduler-Agent-Supervisor

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"
)

type PaymentReceivedEvent struct {
	OrderID      int64
	LockedBy     string
	CompleteBy   *time.Time
	ProcessState string
	FailureCount int64
}

func NewPaymentReceivedEvent(orderID int64) PaymentReceivedEvent {
	return PaymentReceivedEvent{
		OrderID:      orderID,
		LockedBy:     "",
		CompleteBy:   nil,
		ProcessState: "Pending",
		FailureCount: 0,
	}
}

type InvoiceCallbackHandler struct {
	repo OrderSchedulerRepository
}

func (uc *InvoiceCallbackHandler) ReceivePayment() error {
	// Event can be from external sources like webhooks also.
	evt := NewPaymentReceivedEvent(order.ID)
	if err := uc.repo.Save(evt); err != nil {
		return err
	}
	return nil
}

type purchaseAgent struct{}

func (a *purchaseAgent) Purchase(ctx context.Context) error {
	log.Println("doing purchase")
	return nil
}

type OrderScheduler struct {
	purchaseAgent *purchaseAgent
}

func (s *OrderScheduler) init() {
	// repeat every minute
	states := findUnprocessedStates()
	for _, state := range states {
		s.Execute(ctx, state)
	}
}

func (s *OrderScheduler) findUnprocessedStates() {
	// Where lockedby is null and process state is pending
}

func (s *OrderScheduler) Execute(ctx context.Context, state State) error {
	// Transactions.
	switch state.State {
	case "purchase":
		return s.Purchase(ctx, state)
	}
	// Compensations.
	switch state.State {
	case "error":
		return s.Refund(ctx, state)
	}
}

func (s *OrderScheduler) Purchase(ctx context.Context, state State) error {
	order := lockRowAndsetStatusToProcessingAndCompleteByDuration(state.OrderID)

	lockRowAndExecute()
	err := s.purchaseAgent.Purchase(ctx, order)
	if err != nil {
		setStatusToError()
	}
	setStatusToProcessed()
}

type OrderSupervisor struct {
	scheduler *OrderScheduler
}

func (s *OrderSupervisor) FindTimeoutsAndErrors() {
	// Find order where status is processing and completeBy has exceeded
	// Find order where status is error and retryable.
	// Set status to pending, reset completeby and increment failure threshold.
}

func main() {
	fmt.Println("Hello, playground")
}
```

## Control flow for sequential workflow

```go
package main

import (
	"fmt"
)

func main() {
	op := "foo"
	switch op {
	case "foo":
		fmt.Println("init foo")
		fmt.Println("do foo")

		if true {
			fmt.Println("foo fail")
			op = "foo_rollback"
			goto rollback
		}

		fallthrough
	case "bar":
		fmt.Println("init bar")
		fmt.Println("do bar")
		fmt.Println("bar success")
		op = "done"
	}

rollback:
	switch op {
	case "bar_rollback":
		fmt.Println("rollback bar")
		fallthrough
	case "foo_rollback":
		fmt.Println("rollback foo")
	}

	fmt.Println("done")
}
```
