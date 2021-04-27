# Implementation attempt

What are the end goals?
- run to completion (no failure)
- lifecycle observability (created, started, completed, compensated, cancelled or failed)
- explict cancellation - request can be aborted by the user, or they can done by admin
- full compensation. Compensation steps should be handled gracefully.
- language-agnostic - I should be able to implement this in golang or nodejs, regardless of technology stack (minimum using database to store the state)

The database design should have at least two tables

`sagas`
- id 
- name: the name of the saga, e.g. flight booking
- version: for optimistic concurrency control, not to be confused with the saga versioning. Use the name to indicate versioning, e.g. flight booking saga v2
- reference_id: the id of the aggregate root
- step: the current step of the saga (should be inferred from the saga_steps)
- status: the status of the saga, pending, started, completed, failed, aborting, aborted, compensating, compensated
- steps: describes the transaction as well as the compensation steps for the particular saga, useful when versioniong the saga
- payload: the necessary payload for the saga operation
- created_at
- updated_at

`saga_steps`
- id
- saga id: the saga reference id
- name: the name of the step, it is basically the command name, e.g. `CREATE_ORDER`
- status: the status of the step, started, completed, failed
- created_at 
- updated_at
- validity

The orchestration sequence should belong to the application layer, although they could be stored in the database. When any of the steps failed, the saga table stauts will change to compensating and subsequent saga steps will be for the compensations. Once all saga step has been successfully compensated, then the saga status will be completed.

The orchestration does not contain business logic. Each event should only be converted into commands for the next step, and the state persisted.


## Golang draft

We can separate our saga into two different category
- active: instead of event driven messaging, it relies on synchronous calls and a series of workflow steps. Each steps can be executed after one another, or rollback when one of the steps failed. 
- passive: passive saga is much more simple. It receives an event, and decides on which command to execute. Then, it waits for the event from that previous execution before proceeding to the next. This is suitable for long running transactions.

We can have a series of active + passive flow. If any steps in between fail due to infra (server restarts), they can be retried idempotently.

For each event we receive, if it is successful event, it ends the previous step, and init the next step. If it is failure event, it failes the previous steps, and it starts the compensating step. There is a handler to transform the events into commands.

```go
package main

import (
	"context"
	"errors"
	"fmt"
)

func main() {
	fmt.Println("Hello, playground")
}

type Agent struct{}

func (a Agent) Handle(ctx context.Context) error {
	return nil
}

type Scheduler struct{}

// Each step is a command, e.g.
// 1. create order
// 2. create payment
// 3. create delivery

// Each step has an input event, and output event that drives it to the next step.
// E.g. order placed -> create order -> order created
// order created -> create payment -> payment made
// payment failed -> reverse order -> order reversed
//
// Aside from compensating failed transactions, we also need to consider the scenario
// where the cancellation is requested explicitly - user request refund for a successfully placed order etc.
func (s *Scheduler) Handle(ctx context.Context, evt Event) error {
	saga := s.loadSaga(evt) // Internally maps events to commands, and store the initial saga state.
	return s.Exec(ctx, saga)
}

func (s *Scheduler) Exec(ctx context.Context, saga Saga) error {
	if saga.Status == Completed {
		return errors.New("completed")
	}
	step := saga.CurrentStep
	if err := s.SaveStep(ctx, saga, step, Pending); err != nil {
		return err
	}
	status, nextStep := s.On(ctx, step)
	// On failure, increment the error count, and fail them when it reaches a threshold. This avoid too many retries.
	if err := s.SaveStep(ctx, saga, step, status); err != nil {
		return err
	}
	switch status {
	case Success, Failed:
		return s.Exec(ctx, saga)
	case Completed:
		return s.Save(ctx, saga, Completed)
	}
}

func (s *Scheduler) On(ctx context.Context, step Step) (Status, Step) {
	switch step {
	case DoA:
		res, err := doA()
		if err != nil {
			return Failed, UndoA
		}
		return Success, DoB
	case DoB:
		res, err := doB()
		if err != nil {
			return Failed, UndoB
		}
		return Completed, NoOp
	case UndoB:
		res, err := undoB()
		if err != nil {
			return Failed, UndoB
		}
		return Success, UndoA
	case UndoA:
		res, err := undoA()
		if err != nil {
			return Failed, UndoA
		}
		return Completed, NoOp
	case NoOp:
		return Completed, NoOp
	}
}

func (s *Scheduler) Save(ctx context.Context, saga Saga, status Status) error {
	// The saga state is stored in the context (?) as correlation-id.
	return nil
}

func (s *Scheduler) SaveStep(ctx context.Context, saga Saga, step Step, status Status) error {
	return nil
}
```

Alternative design:

```go
package main

type Saga struct {}

// Saga should be created with all the necessary payload that is required to run all the steps to completion.
// This allows us to load the payload and retry the steps programmatically when one of them fails.
saga := NewSaga(id, name) 

// There are two ways to invoke each step, manually or through events.
// When a new events is received, we map the events into commands which will run each steps.
saga.CreateOrder()
saga.CreatePayment()
saga.CreateDelivery()

saga.CancelDelivery()
saga.CancelPayment()
saga.CancelOrder()


func (s *Saga) On(event Event) error {
	command := s.MapEventToCommand(event)
	switch command.Step() {
		case StepOrderCreate:
			return s.CreateOrder()
	}
}

func (s *Saga) CreateOrder() error {
	return s.Do(StepCreateOrder, func() error {
		// Fire
		return ErrRollback
	})
}

func (s *Saga) Do(step Step, fn func() error) error {
	if err := s.SaveStep(step, Pending); err != nil {
		return err
	}
	if err := fn(); err != nil {
		if errors.is(ErrRollback, err) {
			return s.SaveStep(step, Failed)
		}
		return err
	}
	return s.SaveStep(step, Completed)
}
```

## Another implementation

- saga orchestrates the steps required to complete the workflow
- each step consist of a transaction and it's compensation
- compensation can only be executed if the transaction was successful
- each step can be either asynchronous or synchronous
- synchronous steps completes immediately
- asyncronous steps can be long-running, and can be updated through callback/event listener
- when one of the steps fails and is not retryable (validation error, as compared to network/server crash), the all the previous completed steps will be rollback
- each steps should be side-effect free - attempting to run them multiple times should not trigger unexpected behaviour (in reality, this might not be true, and that is why we need to ensure they will not be triggered multiple times)
- saga is completed when all transaction steps run to completion, or when there is a failure in one step, and all the completed ones have been rollbacked
```go
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
)

var ErrRollback = errors.New("rollback")

func RollbackError(msg string) error {
	return fmt.Errorf("%w: %s", ErrRollback, msg)
}

type Status string

var (
	Pending   Status = "pending"
	Completed Status = "completed"
	Failed    Status = "failed"
)

type createOrderStep struct{}

func (c *createOrderStep) Do() Action {
	return &createOrder{}
}

func (c *createOrderStep) Undo() Action {
	return &cancelOrder{}
}

type createOrder struct{}

func (c createOrder) Name() string  { return "create-order" }
func (c createOrder) IsAsync() bool { return false }
func (c createOrder) Do(ctx context.Context) error {
	fmt.Println("creating order")
	return nil
}

type cancelOrder struct{}

func (c cancelOrder) Name() string  { return "cancel-order" }
func (c cancelOrder) IsAsync() bool { return false }
func (c cancelOrder) Do(ctx context.Context) error {
	fmt.Println("cancelling order")
	return nil
}

type createPaymentStep struct{}

func (c *createPaymentStep) Do() Action {
	return &createPayment{}
}

func (c *createPaymentStep) Undo() Action {
	return &refundPayment{}
}

type createPayment struct{}

func (c createPayment) Name() string  { return "create-payment" }
func (c createPayment) IsAsync() bool { return false }
func (c createPayment) Do(ctx context.Context) error {
	return RollbackError("invalid payment method")
}

type refundPayment struct{}

func (c refundPayment) Name() string  { return "refund-payment" }
func (c refundPayment) IsAsync() bool { return false }
func (c refundPayment) Do(ctx context.Context) error {
	fmt.Println("refunding payment")
	return nil
}

func main() {
	s := Saga{
		steps:  []Step{&createOrderStep{}, &createPaymentStep{}},
		status: make(map[string]Status),
	}
	if err := s.Do(context.Background()); err != nil {
		log.Fatal(err)
	}
	if err := s.Do(context.Background()); err != nil {
		log.Fatal(err)
	}
	log.Printf("%+v", s)

}

type Saga struct {
	steps  []Step
	status map[string]Status
}

func (s *Saga) On(ctx context.Context, event string) error {
	// Handle event, e.g. update status completed/failed for that step.
	// Run the step to completion.
	return s.Do(ctx)
}

func (s *Saga) Do(ctx context.Context) error {
	var hasFailure bool
	for _, step := range s.steps {
		doFn := step.Do()
		status := s.status[doFn.Name()]
		if status == Completed {
			continue
		}
		if status == Failed {
			hasFailure = true
			break
		}
		if err := s.do(ctx, doFn); err != nil {
			return err
		}
		if doFn.IsAsync() {
			return nil
		}
	}

	if !hasFailure {
		return nil
	}

	for _, step := range s.steps {
		status := s.status[step.Do().Name()]
		if status != Completed {
			continue
		}
		undoFn := step.Undo()
		status = s.status[undoFn.Name()]
		if status == Completed {
			continue
		}
		if err := s.do(ctx, undoFn); err != nil {
			return err
		}
	}
	return nil
}

// Async step has no success status. The completion is only indicated in the event handler.
// However, failures could still be handled here.
func (s *Saga) do(ctx context.Context, act Action) error {
	if err := s.SaveStep(ctx, act.Name(), Pending); err != nil {
		return err
	}

	if err := act.Do(ctx); err != nil {
		if errors.Is(err, ErrRollback) {
			return s.SaveStep(ctx, act.Name(), Failed)
		}
		return err
	}
	if act.IsAsync() {
		return nil
	}
	return s.SaveStep(ctx, act.Name(), Completed)
}

func (s *Saga) SaveStep(ctx context.Context, name string, status Status) error {
	s.status[name] = status
	return nil
}

type Action interface {
	Name() string
	IsAsync() bool
	Do(ctx context.Context) error
}

type Step interface {
	Do() Action
	Undo() Action
}
```
