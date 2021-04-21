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
	step := s.mapEventToStep(evt) // Each step is literally a command.
	return s.Exec(ctx, step)
}

func (s *Scheduler) Exec(ctx context.Context, step Step) error {
	if err := s.SaveStep(ctx, step, Pending); err != nil {
		return err
	}
	status, nextStep := s.On(ctx, step)
	switch status {
	case Success:
		if err := s.SaveStep(ctx, step, Success); err != nil {
			return err
		}
		return s.Exec(ctx, nextStep)
	case Failed:
		// On failure, increment the error count, and fail them when it reaches a threshold. This avoid too many retries.
		if err := s.SaveStep(ctx, step, Failed); err != nil {
			return err
		}
		return s.Exec(ctx, nextStep)
	case Completed:
		if err := s.SaveStep(ctx, step, Completed); err != nil {
			return err
		}
		return s.Save(ctx, Completed)
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

func (s *Scheduler) Save(ctx context.Context, status Status) error {
	return nil
}

func (s *Scheduler) SaveStep(ctx context.Context, step Step, status Status) error {
	return nil
}
```
