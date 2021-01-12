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

      // A series of transaction, compensation ... must be even number.
      // Allows backward compatibility, like inserting a steps in between etc for new saga, but old logic applies.
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
  do(saga) {
    if (saga.step < 0 || saga.step > saga.steps.length) {
      return saga
    }

    const action = saga.steps[saga.step]

    // ODD.
    if (saga.step & 1) {
      // Compensation.
      const result = this[action]?.(saga)
      saga.logs.push({
        action,
        result
      })
      saga.step -= 2
      return this.do(saga)
    } else {
      // Transaction
      try {
        const result = this[action]?.(saga)
        saga.logs.push({
          action,
          result
        })
        saga.step += 2
      } catch (error) {
        saga.logs.push({
          action,
          error
        })
        saga.step -= 1
      }
      return this.do(saga)
    }
  }
  step1(saga) {
    return {
      event: 'STEP_1_DONE',
      // Use the last log as payload...
      data: saga.logs[saga.logs.length - 1].result
    }
  }
  step2(saga) {
    // throw new Error('step2Error')
    return {
      event: 'STEP_2_DONE',
      data: saga.logs[saga.logs.length - 1].result?.data
    }
  }
  done(saga) {
    return {
      event: 'DONE',
      data: saga.logs[saga.logs.length - 1].result?.data
    }
  }
  compensation1(saga) {
    return {
      event: 'COMPENSATED_1',
      // Use the second last log as payload, as the previous one is failure.
      data: saga.logs[saga.logs.length - 2].result?.data
    }
  }
  compensation2(saga) {
    return {
      event: 'COMPENSATED_2',
      data: saga.logs[saga.logs.length - 1].result
    }
  }
}

function sagaProcessor(saga) {
  switch (saga.name) {
    case TestSaga.name:
      return new TestSaga().do(saga)
    default:
      throw new Error('not implemented')
  }
}

function checkComplete(saga) {
  return saga.step === -1 || saga.step === saga.steps.length
}

const saga = TestSaga.new({
  foo: 'bar'
})
const outputSaga = sagaProcessor(saga)
console.log(outputSaga)
console.log(checkComplete(outputSaga))
```
