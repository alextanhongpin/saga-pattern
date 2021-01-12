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
