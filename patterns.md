## Using single array to store the transaction/compensation pair

```js
function tx(name, error=false) {
  return function () {
    console.log('do', name)
    if (error) throw new Error(`${name}Error`)
  }
}


function saga(name, steps) {
  console.log(name)
  let j = -1
  for (let i = 0; i < steps.length; i+=2) {
    try {
      steps[i]()
    } catch(error) {
      console.log(error)
      j = i-1
    }
  }
  if (j !== -1) {
    for (let k = j; k > -1; k-=2) {
      steps[k]()
    }
  }
  console.log('\n')
}

saga('happy path', [
  tx('tx0'), tx('c0'), 
  tx('tx1'), tx('c1'),
  tx('tx2'), tx('c2')
])

saga('fail 1', [
  tx('tx0'), tx('c0'), 
  tx('tx1', true), tx('c1'),
  tx('tx2'), tx('c2')
])
saga('fail 2', [
  tx('tx0'), tx('c0'), 
  tx('tx1'), tx('c1'),
  tx('tx2', true), tx('c2')
])
```

## Through Recursion

```js

// Transaction: transaction a -> transaction b -> transaction c
// Compensation: compensate a <- compensate b 

function saga(state={}, action='transaction_a') {
  if (!state.logs) state.logs = []
  state.logs.push(action)
  
  switch (action) {
    // Events.
    case 'transaction_a':
      return saga(state, 'transacted_a')
    case 'transaction_b':
      return saga(state, state.bFailed ? 'compensate_a' : 'transacted_b')
    case 'transaction_c':
      return saga(state, state.cFailed ? 'compensate_b' : 'end_saga')
    case 'transacted_a':
      return saga(state, 'transaction_b')
    case 'transacted_b':
      return saga(state, 'transaction_c')
    case 'compensate_a':
      return saga(state, 'end_saga')
    case 'compensate_b':
      return saga(state, 'compensated_b')
    case 'compensated_b':
      return saga(state, 'compensate_a')
    case 'compensated_a':
      return saga(state, 'end_saga')
    case 'end_saga':
      return state
    default:
      throw new Error('not implemented: ' + action)
  }
}


const state = {
  logs: [],
  bFailed: false,
  cFailed: true
}
saga(state)
console.log(state)
```


## Persisting Saga State that is backward compatible

Another design suggestion for saga state that can be persisted in the database:

```js
class TestSaga {
  static new(result) {
    // Creating a backward compatible data structure for saga.
    return {
      // To allow us to target the Class later that orchestrates the saga.
      name: 'TestSaga',

      // Semantic versioning?
      version: '1.0.0',

      // A unique id that is used in all steps, e.g. order id
      correlationId: 'xyz',

      // A series of transaction, compensation ... allows us to map to application code methods.
      // Allows backward compatibility, like inserting a steps in between etc for new saga.
      steps: ['step1', 'compensation1', 'step2', 'compensation2', 'done'],

      // Current step. Even means move forward, odd means move backwards.
      step: 0,

      // Stores input/output for each saga steps.
      logs: [{
        action: 'start',
        result
      }]
    }
  }

  // Recursive approach, alternative to handle.
  do(saga, payload) {
    if (saga.step < 0 || saga.step > saga.steps.length) {
      return saga
    }
    // TODO: The payload will contain information of the current step.
    // Validate against the current step, and skip it if it has been processed.

    const action = saga.steps[saga.step]

    // ODD.
    if (saga.step & 1) {
      // Compensation.
      const result = this[action]?.(payload)
      saga.logs.push({
        action,
        result
      })
      saga.step -= 2
      return this.do(saga, result.data)
    } else {
      // Transaction
      try {
        const result = this[action]?.(payload)
        saga.logs.push({
          action,
          result
        })
        saga.step += 2
        return this.do(saga, result.data)
      } catch (error) {
        saga.logs.push({
          action,
          error
        })
        saga.step -= 1
        return this.do(saga, payload)
      }
    }
  }
  step1(data) {
    return {
      event: 'STEP_1_DONE',
      data
    }
  }
  step2(data) {
    // throw new Error('step2Error')
    return {
      event: 'STEP_2_DONE',
      data
    }
  }
  done(data) {
    return {
      event: 'DONE',
      data
    }
  }
  compensation1(data) {
    return {
      event: 'COMPENSATED_1',
      data
    }
  }
  compensation2(data) {
    return {
      event: 'COMPENSATED_2',
      data
    }
  }
}

function sagaProcessor(saga, payload) {
  switch (saga.name) {
    case TestSaga.name:
      return new TestSaga().do(saga, payload)
    default:
      throw new Error('not implemented')
  }
}

function checkComplete(saga) {
  return saga.step === -1 || saga.step === saga.steps.length
}

const payload = {
  foo: 'bar'
}
const saga = TestSaga.new(payload)
const outputSaga = sagaProcessor(saga, payload)
console.log(outputSaga)
console.log(checkComplete(outputSaga))
```

There are a few assumptions for the data structure above:
- the sequence of transactions/compensation is ordered
- each step uses the payload of the previous action. If an error occured, it uses the payload for that step.
