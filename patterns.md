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
