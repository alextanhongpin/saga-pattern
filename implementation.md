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

import "context"

type Saga struct {
}

func (s *Saga) SaveStep(ctx context.Context, step Step, status Status) {
}

func (s *Saga) Execute(ctx context.Context, id uuid.UUID, name string, event Event) {
	// find saga state
	state := s.upsertSaga(ctx, id, name)
	if state.Completed {
		return errors.New("completed")
	}
	 // OrderCreated -> DoA,  A Failed, B Undone -> UndoA
	// A Done -> Do B, B Failed -> Undo B
	// B Done -> Completed
	command := s.processEvent(event) 
	step := state.GetOrInsertStep(command)

	switch step.Status {
	case DoA:
		s.SaveStep(ctx, DoA, Pending)

		event, err := doA()
		if err != nil {
			// NOTE: If this is async, sending to message queue, the fail here could mean infra failure, not domain failure.
			s.SaveStep(ctx, DoA, Failed)
			state.Status = UndoA
			goto rollback
		}
    command = processEvent(event)
		s.SaveStep(ctx, DoA, Completed)
		s.Status = DoB
		fallthrough
	case DoB:
		s.SaveStep(ctx, DoB, Pending)
		_, err := doB()
		if err != nil {
			s.SaveStep(ctx, DoB, Failed)
			state.Status = UndoB
			goto rollback
		}
		s.SaveStep(ctx, DoB, Completed)
		s.Save(ctx, Completed)
		return
	}

rollback:
	switch state.Status {
	case UndoB:
		s.SaveStep(ctx, UndoB, Pending)

		_, err := undoB()
		if err != nil {
			// NOTE: If this is async, sending to message queue, the fail here could mean infra failure, not domain failure.
			s.SaveStep(ctx, UndoB, Failed)
			return
		}
		s.SaveStep(ctx, UndoB, Completed)
		fallthrough
	case UndoA:
		s.SaveStep(ctx, UndoA, Pending)

		_, err := undoA()
		if err != nil {
			// NOTE: If this is async, sending to message queue, the fail here could mean infra failure, not domain failure.
			s.SaveStep(ctx, UndoA, Failed)
			return
		}
		s.SaveStep(ctx, UndoA, Completed)
		s.Save(ctx, Completed)
		return
	}
}
```
