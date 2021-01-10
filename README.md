# saga-pattern
Dissecting the saga pattern

## How to implement Choreography-based Saga

### 1. Identify the starting point of the saga

The starting point for this is at the `OrderService`, when an order is created by the user.

### 2. Map the transaction/compensation steps

| Service | Transaction | Compensation |
| --          | --           | --      |
| OrderService | (START) createOrder | cancelOrder |
| PaymentService | createPayment | refundPayment |
| DeliveryService | createDelivery | cancelDelivery |
| (END) OrderService | approveOrder | - |

### 3. Map the data flow

This helps us understand the payload required for each step, as well as the changes.

| Service | Step | JSON |
| --      | --          | --           |
| OrderService | createOrder | `{"id": "1", "status": "pending"}` |
| OrderService | cancelOrder | `{"id": "1", "status": "cancelled"}` |
| PaymentService | createPayment | `{"id": "1", "order_id": "1", "status": "confirmed"}` |
| PaymentService | refundPayment | `{"id": "1", "order_id": "1", "status": "refunded"}` |
| DeliveryService | createDelivery | `{"id": "1", "order_id": "1", "status": "confirmed"}` |
| DeliveryService | cancelDelivery | `{"id": "1", "order_id": "1", "status": "cancelled"}` |
| OrderService | approveOrder | `{"id": "1", "status": "approved"}` |

### 4. Map the event for each steps, as well as the equivalent command

Note that transaction steps may be successful or failed, and hence may publish either one success or failed event.

Compensation steps can only publish one event indicating that it is completed - in other words, compensating steps cannot fail.

| Service | Step | Events Raised |
| --      | --          | --            |
| OrderService | createOrder | ORDER_CREATED/ORDER_REJECTED |
| OrderService | cancelOrder | ORDER_CANCELLED |
| PaymentService | createPayment | PAYMENT_CREATED/PAYMENT_REJECTED |
| PaymentService | refundPayment | PAYMENT_REFUNDED |
| DeliveryService | createDelivery | DELIVERY_CREATED/DELIVERY_REJECTED |
| DeliveryService | cancelDelivery | DELIVERY_CANCELLED |
| OrderService | approveOrder | ORDER_APPROVED/ORDER_REJECTED |

### 5. Map the events raised and commands listened by the service

| Service | Subscribe to Commands | Publish Events |
| --      | --          | --            |
| OrderService | CREATE_ORDER, CANCEL_ORDER, APPROVE_ORDER | ORDER_CREATED, ORDER_REJECTED, ORDER_CANCELLED, ORDER_APPROVED |
| PaymentService | CREATE_PAYMENT, REFUND_PAYMENT | PAYMENT_CREATED, PAYMENT_REJECTED, PAYMENT_REFUNDED |
| DeliveryService | CREATE_DELIVERY, CANCEL_DELIVERY | DELIVERY_CREATED, DELIVERY_REJECTED, DELIVERY_CANCELLED |


### 6. Design the saga state machine

Designing the saga is easy with the following rule:

1. The saga orchestrator subscribes to the saga reply channel
2. When the saga orchestrator receive the event, it maps the event to a command, e.g. when an `ORDER_CREATED` event is received, a `CREATE_PAYMENT` command is creatd
3. Saga orchestrator then publishes the command to the service's channel
4. The service then triggers the action, which interacts with the entity (create, update), and persist the event in a local transaction with the Outbox Pattern
5. The service then runs a background tasks that picks the event, and publishes to the saga reply channel
6. Repeat steps 2-5 until it reaches the end

## Saga Execution Coordinator Pseudo Code

Here's a pseudo-code on how the Saga Execution Context might operate:
```python
# PSEUDOCODE, NOT ACTUAL PYTHON CODE

# Publishers. Publish commands.
payment_q = queue('payment')
order_q = queue('order')
delivery_q = queue('delivery')

# Subscribers. Subscribes to events.
saga_q = queue('saga_reply') 
saga_q.consume(event_processor)

event_handlers = {
    'ORDER_CREATED': create_payment_cmd,
    'PAYMENT_CREATED': create_delivery_cmd,
    'PAYMENT_CANCELLED': cancel_order_cmd
}

# Receive events, maps it to the correct handler and publishes commands.
def event_processor(event):
     handler = event_handlers[event.type]
     handler(event.payload)
     ack event
   
def create_payment_cmd(event):
    cmd = {'action': 'CREATE_PAYMENT', 'payload': {}}
    payment_q.publish(cmd)
```

And the service pseudo-code:

```python
# PSEUDOCODE, NOT ACTUAL PYTHON CODE

# Consumer. Consumes commands.
payment_q = queue('payment')
payment_service = PaymentService(payment_q)

# Payment Service
class PaymentService():
    def __init__(self, q):
        self.command_handlers = {
	  'CREATE_PAYMENT': self.create_payment,
	  'CANCEL_PAYMENT': self.cancel_payment
	}
	
	self.q = q
	self.q.subscribe(self.command_processor)

    def command_processor(self, cmd):
    	handler = self.command_handlers[cmd.action]
	handler(cmd.payload)
	ack cmd # If the handler fails, without acknowledging the command from the message queue, we can retry it.

    def create_payment(self, payload):
        # Outbox Pattern - persist both entity and event in a local transaction.
	begin transaction
	    create entity Payment
	    create event PaymentCreated
	commit

# Publisher. Publish events.
saga_q = queue('saga_reply')

# Runs a background task that continuously stream the events to the saga queue.
loop(pool, 10 * second)

def pool():
    begin transaction
    	select event
    	saga_queue.publish(event)
    	delete event
```

The service lifecycle is as follow
1. saga orchestrator publishes commands to the service queue
2. the command processor executes the command
3. each command runs a local transaction that also persist the event (Outbox Pattern)
4. the service publish the events to the saga queue
