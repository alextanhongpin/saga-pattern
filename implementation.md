# Implementation attempt

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
