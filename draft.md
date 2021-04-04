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
		op = "bar"

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
		op = "foo_rollback"
		fallthrough
	case "foo_rollback":
		fmt.Println("rollback foo")
	}

	fmt.Println("done")
}
```

## Scenario

sagas
- id
- status: one of pending, started, succeeded, compensating, compensated
- version: numerical version, to indicate the type, e.g. 1
- type: the type, e.g. order_saga
- current_step: the current step of the saga, e.g. book_flight, end is a special step used to indicate completion
- step_definitions: a json array of [{name, next, undo, rank}]
- locked_at: the time it was last locked
- created_at
- updated_at

saga_step
- id
- saga_id
- status: one of pending, started (we can remove this and indicate it has started once locked at is not null), succeeded, failed
- name: name of step, e.g. book_flight
- request_params: the request params in jsonb
- response_params: the response params in jsonb
- locked_at: the date it last run, can be used to check threshold
- retry_count: the number of retries
- retry_threshold: the max number of retries, 0 means no retry allowed. if the method is compensating, it should never fail.



User book flight
1. User submit flight details (3 flights, and 2 hotels)
2. System create flight entry
3. System create flight_saga
	- status: pending
	- version: 1
	- type: flight_saga
	- current_step: null
	- step_definitions: 
[
	{name: "book_flight_1", next: "book_flight_2", undo: "cancel_flight_1", rank: 1},
	{name: "book_flight_2", next: "book_flight_3", undo: "cancel_flight_2", rank: 2},
	{name: "book_flight_3", next: "done", undo: "cancel_flight_3", rank: 3},
	{name: "cancel_flight_3", next: "cancel_flight_2", undo: null, rank: 4},
	{name: "cancel_flight_2", next: "cancel_flight_1", undo: null, rank: 5},
	{name: "cancel_flight_1", next: "done", undo: null, rank: 6},
]


Scenario: Scheduler process saga
1. Scheduler finds saga that has status pending
2. Scheduler locks row and set locked_at to now
3. Scheduler process workflow
	3a) System crash: Supervisor restarts Scheduler
	3b) Workflow failed: Scheduler set status to compensating and current_step to compensation step

Scenario: Scheduler process workflow
Scheduler will only process those that are pending. It does not care about failed ones. It is supervisor job to reset the status back to pending from failed.
1. Scheduler upserts saga_step with saga_id, status=pending, name.
	1a) Saga step exists: Skip insert
2. Scheduler begins a Unit of Work and locks pending row
	2a) Row is locked: Skip.
	2b) Status is not pending. Skip. Supervisor will update the status.
3. Scheduler set locked_at to now and request_params with the current request params.
        3a) locked and not yet release: raise error running
4. Scheduler commits Unit of Work.
5. Scheduler execute Agent
	4a) Execution fails (irrecoverable): Status will be failed and response_params stored
	4b) Execution successful: Status will be succeeded and response_params stored
	4c) System crash before status is updated: Status will be pending
6. Scheduler update current step to the next and proceed to next step
7. Scheduler repeats process workflow
	7a) next step is done: Saga ends
	
	
	
Scenario: Supervisor looks for pending saga_steps
1. Supervisor looks for pending and locked_at greater than allowed threshold
2. Supervisor queries the source for current status
	2a) There are no source to query: Supervisor continue to next step
3. Supervisor resets the status back to pending, update the retry_count by 1

Scenario: Supervisor looks for failed steps (this does not exist)
1. Supervisor checks the status to check if retryable
2. Supervisor resets the status back to pending, update the retry_count by 1
